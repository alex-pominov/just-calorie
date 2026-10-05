import ExpoModulesCore

struct LoopbackStartOptions: Record {
  @Field var state: String = ""
  @Field var preferredPort: Int = 0
  @Field var timeoutMs: Int = 0
}

/// The JS surface of the one-time sign-in listener. Nothing here logs: a request line carries the authorization code.
public final class LoopbackCallbackModule: Module {
  private let server = LoopbackCallbackServer()

  public func definition() -> ModuleDefinition {
    Name("LoopbackCallback")

    AsyncFunction("start") { (options: LoopbackStartOptions, promise: Promise) in
      self.server.start(state: options.state, preferredPort: options.preferredPort, timeoutMs: options.timeoutMs) { result in
        switch result {
        case .success(let started): promise.resolve(["sessionId": started.sessionId, "port": started.port])
        case .failure(let error): promise.reject(error.code, error.message)
        }
      }
    }

    AsyncFunction("waitForCallback") { (sessionId: Int, promise: Promise) in
      self.server.waitForCallback(sessionId: sessionId) { result in
        switch result {
        case .success(let params): promise.resolve(params)
        case .failure(let error): promise.reject(error.code, error.message)
        }
      }
    }

    AsyncFunction("stop") { (sessionId: Int, promise: Promise) in
      self.server.stop(sessionId: sessionId) { promise.resolve() }
    }

    OnAppEntersForeground {
      self.server.reopenAfterSuspension()
    }

    OnDestroy {
      self.server.shutdown()
    }
  }
}
