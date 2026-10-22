import Foundation

enum ReframeValue: Codable, Sendable, Equatable {
    case text(String), flag(Bool)
    init(from decoder: Decoder) throws {
        let value = try decoder.singleValueContainer()
        if let flag = try? value.decode(Bool.self) { self = .flag(flag) }
        else { self = .text(try value.decode(String.self)) }
    }
    func encode(to encoder: Encoder) throws {
        var value = encoder.singleValueContainer()
        switch self { case .text(let text): try value.encode(text); case .flag(let flag): try value.encode(flag) }
    }
    var text: String { switch self { case .text(let text): return text; case .flag(let flag): return String(flag) } }
    var flag: Bool { if case .flag(let flag) = self { return flag }; return false }
}
struct ReframeRecord: Codable, Identifiable, Sendable { let id: String; let values: [String: ReframeValue] }
struct ReframeSnapshot: Codable, Sendable {
    var version: Int; var records: [ReframeRecord]; var counters: [String: Int]; var toggles: [String: Bool]
    var result: String? = nil; var token: String? = nil
    static let empty = ReframeSnapshot(version: 0, records: [], counters: [:], toggles: [:])
}
struct ReframeField: Codable, Identifiable, Sendable { let id: String; let label: String; let type: String; let required: Bool }
struct ReframeAction: Codable, Identifiable, Sendable { let id: String; let label: String; let operation: String; let target: String; let message: String }
struct ReframeSpec: Codable, Sendable { let id: String; let name: String; let fields: [ReframeField]; let actions: [ReframeAction]; let authRequired: Bool? }
struct ReframeUser: Codable, Sendable { let id: String; let email: String }
struct ReframeAccountState: Codable, Sendable { let user: ReframeUser?; let token: String? }
struct ReframeCredential: Codable, Identifiable, Sendable { let name: String; let configured: Bool; let endpoint: String; let method: String; var id: String { name } }
struct ReframeCredentials: Codable, Sendable { let keys: [ReframeCredential] }
struct ReframeRequest: Codable, Sendable {
    let action: String; let values: [String: ReframeValue]; let recordId: String; let query: String
    let version: Int; let requestId: String
}
struct ReframeFailure: LocalizedError, Sendable { let message: String; var status: Int? = nil; var errorDescription: String? { message } }
struct ReframeClient: Sendable {
    let baseURL: URL; let featureID: String; var token: String? = nil
    func request(_ body: ReframeRequest? = nil) async throws -> ReframeSnapshot {
        try JSONDecoder().decode(ReframeSnapshot.self, from: await send("", body: body.map { try! JSONEncoder().encode($0) }))
    }
    func account(operation: String? = nil, email: String = "", password: String = "") async throws -> ReframeAccountState {
        let body = operation.map { try! JSONEncoder().encode(["operation": $0, "email": email, "password": password]) }
        return try JSONDecoder().decode(ReframeAccountState.self, from: await send("/auth", body: body))
    }
    func credentials(name: String? = nil, value: String = "") async throws -> [ReframeCredential] {
        let body = name.map { try! JSONEncoder().encode(["name": $0, "value": value]) }
        return try JSONDecoder().decode(ReframeCredentials.self, from: await send("/credentials", body: body)).keys
    }
    private func send(_ route: String, body: Data?) async throws -> Data {
        guard ["http", "https"].contains(baseURL.scheme?.lowercased() ?? ""), baseURL.user == nil, baseURL.password == nil else { throw ReframeFailure(message: "Use an HTTP(S) backend without URL credentials.") }
        let url = baseURL.appendingPathComponent("api/reframe/" + featureID + route)
        var request = URLRequest(url: url); request.timeoutInterval = 10
        request.httpShouldHandleCookies = false
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("native", forHTTPHeaderField: "X-Reframe-Client")
        if let token { request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization") }
        if let body { request.httpMethod = "POST"; request.setValue("application/json", forHTTPHeaderField: "Content-Type"); request.httpBody = body }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let response = response as? HTTPURLResponse else { throw ReframeFailure(message: "Invalid backend response.") }
        guard (200..<300).contains(response.statusCode) else {
            let error = (try? JSONSerialization.jsonObject(with: data)) as? [String: String]
            throw ReframeFailure(message: error?["error"] ?? "Backend returned HTTP \(response.statusCode).", status: response.statusCode)
        }
        return data
    }
}
