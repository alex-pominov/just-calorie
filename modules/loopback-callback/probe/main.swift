import Foundation

// Drives LoopbackCallbackServer as a macOS process for scripts/probe-loopback-listener.sh. Not part of the app:
// the podspec compiles ios/ only. Arguments: state, preferred port, timeout in ms. SIGUSR1 reopens the listener.
let arguments = CommandLine.arguments
let state = arguments[1]
let preferredPort = Int(arguments[2]) ?? 1455
let timeoutMs = Int(arguments[3]) ?? 30_000
let server = LoopbackCallbackServer()

func report(_ line: String) {
  print(line)
  fflush(stdout)
}

server.start(state: state, preferredPort: preferredPort, timeoutMs: timeoutMs) { started in
  switch started {
  case .success(let listening):
    report("STARTED port=\(listening.port)")
    server.waitForCallback(sessionId: listening.sessionId) { outcome in
      switch outcome {
      case .success(let params):
        report("CALLBACK " + params.keys.sorted().map { "\($0)=\(params[$0] ?? "")" }.joined(separator: "&"))
      case .failure(let error):
        report("REJECTED \(error.code)")
      }

      DispatchQueue.main.asyncAfter(deadline: .now() + 1) { exit(0) }
    }
  case .failure(let error):
    report("START-FAILED \(error.code)")
    exit(1)
  }
}

signal(SIGUSR1, SIG_IGN)

let reopen = DispatchSource.makeSignalSource(signal: SIGUSR1, queue: .main)

reopen.setEventHandler {
  server.reopenAfterSuspension()
  report("REOPENED")
}
reopen.resume()
dispatchMain()
