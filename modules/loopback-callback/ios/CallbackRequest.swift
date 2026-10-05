import Foundation

/// The only path the listener answers. OpenAI redirects to http://127.0.0.1:<port>/auth/callback.
let loopbackCallbackPath = "/auth/callback"

/// Where a request head ends, and whether it fits the cap.
enum RequestHeadScan: Equatable {
  case complete(Data)
  case incomplete
  case tooLarge
}

/// What one request on the listener gets: the callback it was waiting for, or a refusal that keeps it waiting.
enum CallbackVerdict: Equatable {
  case accepted([String: String])
  case refused(LoopbackResponse)
}

enum CallbackRequest {
  private static let headTerminator = Data("\r\n\r\n".utf8)

  /// The request head (request line and headers, without the blank line) once the buffer holds all of it.
  static func scanHead(_ buffer: Data, limit: Int) -> RequestHeadScan {
    guard let end = buffer.range(of: headTerminator) else {
      return buffer.count >= limit ? .tooLarge : .incomplete
    }

    let headLength = end.lowerBound - buffer.startIndex

    guard headLength + headTerminator.count <= limit else { return .tooLarge }

    return .complete(buffer.subdata(in: buffer.startIndex..<end.lowerBound))
  }

  /// Judges one request head. Only `GET /auth/callback` for this host and port, whose `state` is the expected one,
  /// is accepted. A callback that carries `error=` with the matching state is accepted too: the caller decides.
  static func evaluate(head: Data, expectedState: String, port: Int) -> CallbackVerdict {
    guard let text = String(data: head, encoding: .utf8) else { return .refused(.badRequest) }

    let lines = text.components(separatedBy: "\r\n")

    guard let requestLine = lines.first else { return .refused(.badRequest) }

    let parts = requestLine.split(separator: " ", omittingEmptySubsequences: false)

    guard parts.count == 3, parts[2].hasPrefix("HTTP/1.") else { return .refused(.badRequest) }
    guard parts[0] == "GET" else { return .refused(.methodNotAllowed) }

    let target = parts[1]

    guard target.hasPrefix("/") else { return .refused(.badRequest) }

    let pathAndQuery = target.split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false)

    guard pathAndQuery.first.map(String.init) == loopbackCallbackPath else { return .refused(.notFound) }
    guard hostHeader(lines.dropFirst()) == "127.0.0.1:\(port)" else { return .refused(.badRequest) }
    guard let params = queryParameters(pathAndQuery.count == 2 ? String(pathAndQuery[1]) : "") else {
      return .refused(.badRequest)
    }
    guard let state = params["state"], constantTimeEquals(state, expectedState) else {
      return .refused(.badRequest)
    }

    return .accepted(params)
  }

  /// The single Host header's value, or nil when there is none or more than one.
  private static func hostHeader<Lines: Sequence>(_ headerLines: Lines) -> String? where Lines.Element == String {
    var host: String?

    for line in headerLines {
      guard let colon = line.firstIndex(of: ":") else { continue }
      guard line[..<colon].trimmingCharacters(in: .whitespaces).lowercased() == "host" else { continue }
      guard host == nil else { return nil }

      host = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
    }

    return host
  }

  /// Form-decoded query parameters (`+` is a space), or nil for a malformed query or a repeated name,
  /// which RFC 6749 §3.1 forbids.
  static func queryParameters(_ query: String) -> [String: String]? {
    var params: [String: String] = [:]

    for pair in query.split(separator: "&", omittingEmptySubsequences: true) {
      let keyValue = pair.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false)

      guard let key = formDecode(keyValue[0]), !key.isEmpty else { return nil }
      guard let value = formDecode(keyValue.count == 2 ? keyValue[1] : "") else { return nil }
      guard params[key] == nil else { return nil }

      params[key] = value
    }

    return params
  }

  private static func formDecode(_ text: Substring) -> String? {
    text.replacingOccurrences(of: "+", with: " ").removingPercentEncoding
  }

  /// Compares every byte whatever the first difference, so the time taken does not reveal how much matched.
  static func constantTimeEquals(_ lhs: String, _ rhs: String) -> Bool {
    let left = Array(lhs.utf8)
    let right = Array(rhs.utf8)

    guard left.count == right.count else { return false }

    var difference: UInt8 = 0

    for index in left.indices {
      difference |= left[index] ^ right[index]
    }

    return difference == 0
  }
}

/// Every answer the listener sends. None echoes anything from the request, and the 200 claims no outcome: the code
/// exchange and the checks after it run in JS, after this page is served.
enum LoopbackResponse: Equatable {
  case callbackReceived
  case badRequest
  case notFound
  case methodNotAllowed
  case headTooLarge

  private var status: (code: Int, reason: String) {
    switch self {
    case .callbackReceived: return (200, "OK")
    case .badRequest: return (400, "Bad Request")
    case .notFound: return (404, "Not Found")
    case .methodNotAllowed: return (405, "Method Not Allowed")
    case .headTooLarge: return (431, "Request Header Fields Too Large")
    }
  }

  private var message: String {
    switch self {
    case .callbackReceived: return "Return to Just Calorie to finish. You can close this page."
    case .badRequest, .headTooLarge: return "This is not a sign-in callback Just Calorie is waiting for."
    case .notFound: return "Not found."
    case .methodNotAllowed: return "Method not allowed."
    }
  }

  private var body: Data {
    Data(
      """
      <!doctype html><html lang="en"><head><meta charset="utf-8">\
      <meta name="viewport" content="width=device-width, initial-scale=1"><title>Just Calorie</title></head>\
      <body style="font-family: -apple-system, system-ui, sans-serif; text-align: center; padding: 48px 24px;">\
      <p>\(message)</p></body></html>
      """.utf8)
  }

  /// The whole HTTP/1.1 response. The connection closes after it.
  var bytes: Data {
    let body = self.body
    var head = "HTTP/1.1 \(status.code) \(status.reason)\r\n"

    head += "Content-Type: text/html; charset=utf-8\r\n"
    head += "Content-Length: \(body.count)\r\n"
    head += "Cache-Control: no-store\r\n"
    head += "Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'\r\n"
    head += "Referrer-Policy: no-referrer\r\n"
    head += "X-Content-Type-Options: nosniff\r\n"

    if self == .methodNotAllowed {
      head += "Allow: GET\r\n"
    }

    head += "Connection: close\r\n\r\n"

    return Data(head.utf8) + body
  }
}
