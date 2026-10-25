import SwiftUI

@MainActor struct ReframeNativeCommunity: View {
    var apiBase = URL(string: "http://127.0.0.1:5176")!
    @Environment(\.openURL) private var openURL
    private let spec = try! JSONDecoder().decode(ReframeSpec.self, from: Data(base64Encoded: "eyJ2ZXJzaW9uIjoxLCJpZCI6InJmXzY1MjllZTkxNjVjNSIsIm5hbWUiOiJOYXRpdmUgY29tbXVuaXR5IiwiZmllbGRzIjpbeyJpZCI6ImZpZWxkMSIsImxhYmVsIjoiRW1haWwiLCJ0eXBlIjoiZW1haWwiLCJyZXF1aXJlZCI6dHJ1ZX1dLCJhY3Rpb25zIjpbeyJpZCI6ImFjdGlvbjEiLCJsYWJlbCI6IlNhdmUiLCJocmVmIjpudWxsLCJvcGVyYXRpb24iOiJjcmVhdGUiLCJ0YXJnZXQiOiIiLCJtZXNzYWdlIjoiIiwicmVhc29uIjoiU3VnZ2VzdGVkIGZyb20gdmlzaWJsZSBsYWJlbHMgb3IgbGlua3M7IHJldmlldyBiZWZvcmUgYnVpbGRpbmcuIn0seyJpZCI6ImFjdGlvbjIiLCJsYWJlbCI6IkNvdW50IiwiaHJlZiI6bnVsbCwib3BlcmF0aW9uIjoiaW5jcmVtZW50IiwidGFyZ2V0IjoiIiwibWVzc2FnZSI6IiIsInJlYXNvbiI6IlN1Z2dlc3RlZCBmcm9tIHZpc2libGUgbGFiZWxzIG9yIGxpbmtzOyByZXZpZXcgYmVmb3JlIGJ1aWxkaW5nLiJ9XX0=")!)
    private struct Copy: Decodable { let text: String; let heading: Bool }
    private let copy = try! JSONDecoder().decode([Copy].self, from: Data(base64Encoded: "W3sidGV4dCI6Ik5hdGl2ZSBjb21tdW5pdHkiLCJoZWFkaW5nIjpmYWxzZX1d")!)
    @State private var data = ReframeSnapshot.empty
    @State private var values: [String: ReframeValue] = [:]
    @State private var selected = ""
    @State private var message = ""
    @State private var error = ""
    @State private var fingerprint = ""
    @State private var pending: ReframeRequest?
    @State private var busy = false
    @State private var ready = false
    private var client: ReframeClient { ReframeClient(baseURL: apiBase, featureID: spec.id) }
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            ForEach(Array(copy.enumerated()), id: \.offset) { _, line in Text(line.text).font(line.heading ? .headline : .body) }
            ForEach(spec.fields) { field in
                if field.type == "checkbox" {
                    Toggle(field.label, isOn: Binding(get: { values[field.id]?.flag ?? false }, set: { values[field.id] = .flag($0) }))
                } else {
                    TextField(field.label, text: Binding(get: { values[field.id]?.text ?? "" }, set: { values[field.id] = .text($0) })).textFieldStyle(.roundedBorder).accessibilityLabel(field.label)
                }
            }.disabled(busy || !ready)
            ForEach(spec.actions) { action in Button(action.label) { Task { await perform(action) } }.disabled(busy || !ready) }
            if !ready { Button("Retry loading") { Task { await load() } }.disabled(busy) }
            if busy { ProgressView() }
            if !message.isEmpty { Text(message).accessibilityAddTraits(.updatesFrequently) }
            if !error.isEmpty { Text(error).foregroundStyle(.red) }
            ForEach(spec.actions.filter { $0.operation == "toggle" || $0.operation == "increment" }) { action in
                Text(action.label + ": " + (action.operation == "increment" ? String(data.counters[action.id] ?? 0) : (data.toggles[action.id] == true ? "On" : "Off")))
            }
            if spec.actions.contains(where: { ["create", "update", "delete", "search"].contains($0.operation) }) {
                Text("Saved records: \(data.records.count)").font(.headline)
                ForEach(data.records) { record in
                    Button(spec.fields.map { record.values[$0.id]?.text ?? "" }.joined(separator: " · ")) { selected = record.id; values = record.values; message = "Record selected." }.disabled(busy)
                }
            }
        }.task(id: apiBase) { ready = false; await load() }
    }
    private func load() async {
        busy = true; defer { busy = false }
        do { data = try await client.request(); ready = true; error = ""; if values.isEmpty { reset() } }
        catch { self.error = error.localizedDescription }
    }
    private func reset() { values = Dictionary(uniqueKeysWithValues: spec.fields.map { ($0.id, $0.type == "checkbox" ? ReframeValue.flag(false) : .text("")) }); selected = "" }
    private func perform(_ action: ReframeAction) async {
        guard !busy, ready else { return }; error = ""; message = ""
        if action.operation == "navigate" { if let url = URL(string: action.target, relativeTo: apiBase) { openURL(url) }; return }
        if action.operation == "details" { message = action.message; return }
        if action.operation == "reset" { reset(); return }
        if ["update", "delete"].contains(action.operation) && selected.isEmpty { error = "Select a saved record first."; return }
        let query = spec.fields.map { values[$0.id]?.text ?? "" }.joined(separator: " ")
        let encoder = JSONEncoder(); encoder.outputFormatting = .sortedKeys
        let key = action.id + selected + query + ((try? String(data: encoder.encode(values), encoding: .utf8)) ?? "")
        if key != fingerprint || pending == nil { fingerprint = key; pending = ReframeRequest(action: action.id, values: values, recordId: selected, query: query, version: data.version, requestId: UUID().uuidString) }
        guard let request = pending else { return }; busy = true; defer { busy = false }
        do { data = try await client.request(request); pending = nil; message = action.label + " completed."; if ["create", "delete"].contains(action.operation) { reset() } }
        catch { self.error = error.localizedDescription; if let failure = error as? ReframeFailure, let status = failure.status, (400..<500).contains(status) { pending = nil }; if let latest = try? await client.request() { data = latest } }
    }
}
