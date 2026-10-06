import ExpoModulesCore
import Foundation

struct HttpCookieKey: Record {
  @Field var name: String = ""
  @Field var domain: String = ""
  @Field var path: String = ""
}

/// The app's shared cookie store, HTTPCookieStorage.shared, which React Native's fetch and expo/fetch both write to.
/// No cookie's value ever crosses to JS, and nothing here logs.
public final class HttpCookiesModule: Module {
  public func definition() -> ModuleDefinition {
    Name("HttpCookies")

    AsyncFunction("list") { () -> [[String: String]] in
      (HTTPCookieStorage.shared.cookies ?? []).map { ["name": $0.name, "domain": $0.domain, "path": $0.path] }
    }

    AsyncFunction("remove") { (keys: [HttpCookieKey]) in
      let storage = HTTPCookieStorage.shared
      let named = { (cookie: HTTPCookie) in
        keys.contains { $0.name == cookie.name && $0.domain == cookie.domain && $0.path == cookie.path }
      }

      (storage.cookies ?? []).filter(named).forEach(storage.deleteCookie)
    }
  }
}
