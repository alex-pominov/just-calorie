import Foundation

struct LoopbackStarted {
  let sessionId: Int
  let port: Int
}

/// Holds at most one listening session. Starting a new one supersedes the old one, whose waiter is rejected.
/// Every entry point hops onto one serial queue, which is also the queue Network.framework calls back on.
final class LoopbackCallbackServer {
  private let queue = DispatchQueue(label: "loopback-callback")
  private var lastSessionId = 0
  private var session: LoopbackSession?

  func start(
    state: String,
    preferredPort: Int,
    timeoutMs: Int,
    completion: @escaping (Result<LoopbackStarted, LoopbackError>) -> Void
  ) {
    queue.async {
      guard Self.isValid(state: state), (1...65_535).contains(preferredPort), (1...LoopbackLimits.maxTimeoutMs).contains(timeoutMs) else {
        completion(.failure(.invalidOptions))
        return
      }

      self.session?.finish(.failure(.superseded))
      self.lastSessionId += 1

      let session = LoopbackSession(id: self.lastSessionId, expectedState: state, queue: self.queue)

      self.session = session
      session.begin(preferredPort: UInt16(preferredPort), timeoutMs: timeoutMs) { result in
        completion(result.map { LoopbackStarted(sessionId: session.id, port: $0) })
      }
    }
  }

  func waitForCallback(sessionId: Int, completion: @escaping (LoopbackSession.Outcome) -> Void) {
    queue.async {
      guard let session = self.session, session.id == sessionId else {
        completion(.failure(sessionId < self.lastSessionId ? .superseded : .noSession))
        return
      }

      session.waitForCallback(completion)
    }
  }

  /// Stops the session with this id, if it is still the current one; a stale id stops nothing.
  func stop(sessionId: Int, completion: @escaping () -> Void) {
    queue.async {
      if let session = self.session, session.id == sessionId {
        session.finish(.failure(.cancelled))
      }

      completion()
    }
  }

  func reopenAfterSuspension() {
    queue.async {
      self.session?.reopenAfterSuspension()
    }
  }

  func shutdown() {
    queue.async {
      self.session?.finish(.failure(.cancelled))
      self.session = nil
    }
  }

  private static func isValid(state: String) -> Bool {
    !state.isEmpty && state.utf8.count <= LoopbackLimits.maxStateLength
  }
}
