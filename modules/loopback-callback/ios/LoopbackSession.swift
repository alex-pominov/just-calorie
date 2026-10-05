import Foundation
import Network

/// A failure the JS side switches on by `code`. Messages are fixed text: nothing from a request reaches one.
struct LoopbackError: Error, Equatable {
  let code: String
  let message: String

  static let invalidOptions = LoopbackError(code: "ERR_LOOPBACK_INVALID_OPTIONS", message: "The loopback listener options are invalid")
  static let startFailed = LoopbackError(code: "ERR_LOOPBACK_START_FAILED", message: "The loopback listener could not start")
  static let failed = LoopbackError(code: "ERR_LOOPBACK_FAILED", message: "The loopback listener stopped unexpectedly")
  static let timedOut = LoopbackError(code: "ERR_LOOPBACK_TIMEOUT", message: "No sign-in callback arrived in time")
  static let cancelled = LoopbackError(code: "ERR_LOOPBACK_CANCELLED", message: "The loopback listener was stopped")
  static let superseded = LoopbackError(code: "ERR_LOOPBACK_SUPERSEDED", message: "A newer sign-in replaced this listener")
  static let noSession = LoopbackError(code: "ERR_LOOPBACK_NO_SESSION", message: "No loopback listener has this id")
  static let alreadyWaiting = LoopbackError(code: "ERR_LOOPBACK_ALREADY_WAITING", message: "This listener already has a waiter")
}

enum LoopbackLimits {
  static let maxRequestHeadBytes = 8 * 1024
  static let connectionDeadline: DispatchTimeInterval = .seconds(10)
  /// A browser sends its request as soon as it connects; a connection silent this long is someone holding a slot.
  static let firstByteDeadline: DispatchTimeInterval = .seconds(2)
  static let maxOpenConnections = 8
  static let maxTimeoutMs = 15 * 60 * 1000
  static let maxStateLength = 512
  static let maxFailedRebinds = 3
}

/// A connection the session holds. `order` is when it arrived; one that has not delivered a whole request head is the
/// first to make room when every slot is taken.
private struct TrackedConnection {
  let connection: NWConnection
  let order: Int
  let deadline: DispatchWorkItem
  var firstByteDeadline: DispatchWorkItem?
  var deliveredHead = false

  func cancelDeadlines() {
    deadline.cancel()
    firstByteDeadline?.cancel()
  }
}

/// One sign-in's listener: bound to 127.0.0.1 only, it settles once — on the first callback with the expected state,
/// on its timeout, or when stopped or superseded — and then closes the listener and every connection.
/// Every method and every Network.framework callback runs on `queue`, which is serial.
final class LoopbackSession {
  typealias Outcome = Result<[String: String], LoopbackError>

  let id: Int
  private let expectedState: String
  private let queue: DispatchQueue
  private var listener: NWListener?
  private var connections: [ObjectIdentifier: TrackedConnection] = [:]
  private var acceptedConnections = 0
  private var timeout: DispatchWorkItem?
  private var boundPort = 0
  private var triedAnyPort = false
  private var failedRebinds = 0
  private var onStarted: ((Result<Int, LoopbackError>) -> Void)?
  private var onCallback: ((Outcome) -> Void)?
  private var outcome: Outcome?

  init(id: Int, expectedState: String, queue: DispatchQueue) {
    self.id = id
    self.expectedState = expectedState
    self.queue = queue
  }

  var isFinished: Bool { outcome != nil }

  /// Binds `preferredPort`, or a port the system picks when that one is taken, and reports the bound port.
  func begin(preferredPort: UInt16, timeoutMs: Int, onStarted: @escaping (Result<Int, LoopbackError>) -> Void) {
    self.onStarted = onStarted

    let timeout = DispatchWorkItem { [weak self] in self?.finish(.failure(.timedOut)) }

    self.timeout = timeout
    queue.asyncAfter(deadline: .now() + .milliseconds(timeoutMs), execute: timeout)
    listen(on: preferredPort)
  }

  /// Hands the outcome to `completion` once there is one; at most one waiter.
  func waitForCallback(_ completion: @escaping (Outcome) -> Void) {
    if let outcome {
      completion(outcome)
    } else if onCallback != nil {
      completion(.failure(.alreadyWaiting))
    } else {
      onCallback = completion
    }
  }

  /// Settles the session once: closes the listener and every connection but `kept`, and reports to JS.
  func finish(_ result: Outcome, keeping kept: NWConnection? = nil) {
    guard outcome == nil else { return }

    outcome = result
    timeout?.cancel()
    timeout = nil
    listener?.cancel()
    listener = nil

    for tracked in connections.values where tracked.connection !== kept {
      drop(tracked.connection)
    }

    if let started = onStarted {
      onStarted = nil
      started(.failure(result.failureOr(.failed)))
    }

    if let waiter = onCallback {
      onCallback = nil
      waiter(result)
    }
  }

  // MARK: - Listener

  private func listen(on port: UInt16) {
    let listener: NWListener

    do {
      listener = try NWListener(using: Self.loopbackParameters(port: port))
    } catch {
      finish(.failure(.startFailed))
      return
    }

    self.listener = listener
    listener.stateUpdateHandler = { [weak self, weak listener] state in
      guard let self, let listener, listener === self.listener else { return }

      self.listenerChanged(to: state, listener: listener)
    }
    listener.newConnectionHandler = { [weak self] connection in
      guard let self else {
        connection.cancel()
        return
      }

      self.accept(connection)
    }
    listener.start(queue: queue)
  }

  /// TCP on IPv4 127.0.0.1 alone. `NWListener(using:on:)` would bind every interface, so the address is required here.
  /// MUST NOT set `acceptLocalOnly`: in the iOS simulator it made Network.framework ignore a real 127.0.0.1 peer as
  /// "non-local" and reset it, silently, and the bind plus `isLoopback` already confine the listener (f-e41a92).
  private static func loopbackParameters(port: UInt16) -> NWParameters {
    let parameters = NWParameters.tcp

    parameters.requiredLocalEndpoint = .hostPort(host: .ipv4(.loopback), port: NWEndpoint.Port(rawValue: port) ?? .any)
    parameters.requiredInterfaceType = .loopback
    parameters.includePeerToPeer = false
    parameters.allowLocalEndpointReuse = false

    if let ip = parameters.defaultProtocolStack.internetProtocol as? NWProtocolIP.Options {
      ip.version = .v4
    }

    return parameters
  }

  private func listenerChanged(to state: NWListener.State, listener: NWListener) {
    switch state {
    case .ready:
      failedRebinds = 0

      guard onStarted != nil else { return }
      guard let port = listener.port?.rawValue, port != 0 else {
        finish(.failure(.startFailed))
        return
      }

      boundPort = Int(port)

      let started = onStarted

      onStarted = nil
      started?(.success(boundPort))
    case .failed(let error):
      listenerFailed(error, listener: listener)
    case .waiting(let error) where onStarted != nil:
      listenerFailed(error, listener: listener)
    default:
      break
    }
  }

  /// Before the port is reported, a taken preferred port is retried once on a port the system picks. After it, the
  /// redirect URI names that port, so a failed listener is rebound to it, up to `maxFailedRebinds` times in a row.
  private func listenerFailed(_ error: NWError, listener: NWListener) {
    if onStarted != nil {
      guard !triedAnyPort, case .posix(.EADDRINUSE) = error else {
        finish(.failure(.startFailed))
        return
      }

      triedAnyPort = true
      listener.cancel()
      self.listener = nil
      listen(on: 0)
      return
    }

    guard failedRebinds < LoopbackLimits.maxFailedRebinds else {
      finish(.failure(.failed))
      return
    }

    failedRebinds += 1
    rebind()
  }

  /// iOS may reclaim a suspended app's listening socket, so returning to the foreground mid-sign-in rebinds the
  /// reported port. Connections already accepted are left as they are.
  func reopenAfterSuspension() {
    guard !isFinished, onStarted == nil, listener != nil else { return }

    rebind()
  }

  private func rebind() {
    listener?.cancel()
    listener = nil

    guard let port = UInt16(exactly: boundPort), port != 0 else {
      finish(.failure(.failed))
      return
    }

    listen(on: port)
  }

  // MARK: - Connections

  private func accept(_ connection: NWConnection) {
    guard !isFinished, Self.isLoopback(connection.endpoint), makeRoom() else {
      connection.cancel()
      return
    }

    acceptedConnections += 1
    connections[ObjectIdentifier(connection)] = TrackedConnection(
      connection: connection,
      order: acceptedConnections,
      deadline: drop(connection, after: LoopbackLimits.connectionDeadline),
      firstByteDeadline: drop(connection, after: LoopbackLimits.firstByteDeadline)
    )
    connection.stateUpdateHandler = { [weak self, weak connection] state in
      guard let self, let connection else { return }

      switch state {
      case .failed, .cancelled: self.forget(connection)
      default: break
      }
    }
    connection.start(queue: queue)
    receiveHead(on: connection, buffer: Data())
  }

  /// True when a slot is free. At the cap, the oldest connection that has not delivered a whole request head is dropped
  /// for the newcomer, so local connections held idle cannot deny the browser's callback (qa f-6d2a95).
  private func makeRoom() -> Bool {
    guard connections.count >= LoopbackLimits.maxOpenConnections else { return true }
    guard let oldest = connections.values.filter({ !$0.deliveredHead }).min(by: { $0.order < $1.order }) else { return false }

    drop(oldest.connection)

    return true
  }

  private func drop(_ connection: NWConnection, after delay: DispatchTimeInterval) -> DispatchWorkItem {
    let work = DispatchWorkItem { [weak self, weak connection] in
      guard let self, let connection else { return }

      self.drop(connection)
    }

    queue.asyncAfter(deadline: .now() + delay, execute: work)

    return work
  }

  private func receiveHead(on connection: NWConnection, buffer: Data) {
    connection.receive(minimumIncompleteLength: 1, maximumLength: LoopbackLimits.maxRequestHeadBytes) {
      [weak self, weak connection] data, _, isComplete, error in
      guard let self, let connection, self.isTracked(connection) else { return }

      let key = ObjectIdentifier(connection)
      var buffer = buffer

      if let data, !data.isEmpty {
        buffer.append(data)
        self.connections[key]?.firstByteDeadline?.cancel()
        self.connections[key]?.firstByteDeadline = nil
      }

      switch CallbackRequest.scanHead(buffer, limit: LoopbackLimits.maxRequestHeadBytes) {
      case .complete(let head):
        self.connections[key]?.deliveredHead = true
        self.handle(head: head, on: connection)
      case .tooLarge:
        self.connections[key]?.deliveredHead = true
        self.respond(.headTooLarge, on: connection)
      case .incomplete:
        if isComplete || error != nil {
          self.drop(connection)
        } else {
          self.receiveHead(on: connection, buffer: buffer)
        }
      }
    }
  }

  private func handle(head: Data, on connection: NWConnection) {
    guard !isFinished else {
      drop(connection)
      return
    }

    switch CallbackRequest.evaluate(head: head, expectedState: expectedState, port: boundPort) {
    case .accepted(let params):
      respond(.callbackReceived, on: connection)
      finish(.success(params), keeping: connection)
    case .refused(let response):
      respond(response, on: connection)
    }
  }

  /// Sends the whole response and a FIN, then closes the connection.
  private func respond(_ response: LoopbackResponse, on connection: NWConnection) {
    connection.send(content: response.bytes, contentContext: .finalMessage, isComplete: true, completion: .contentProcessed {
      [weak self, weak connection] _ in
      guard let self, let connection else { return }

      self.drop(connection)
    })
  }

  private func drop(_ connection: NWConnection) {
    forget(connection)
    connection.cancel()
  }

  private func forget(_ connection: NWConnection) {
    connections.removeValue(forKey: ObjectIdentifier(connection))?.cancelDeadlines()
  }

  private func isTracked(_ connection: NWConnection) -> Bool {
    connections[ObjectIdentifier(connection)] != nil
  }

  private static func isLoopback(_ endpoint: NWEndpoint) -> Bool {
    guard case .hostPort(let host, _) = endpoint, case .ipv4(let address) = host else { return false }

    return address.isLoopback
  }
}

private extension Result where Failure == LoopbackError {
  func failureOr(_ fallback: LoopbackError) -> LoopbackError {
    if case .failure(let error) = self { return error }

    return fallback
  }
}
