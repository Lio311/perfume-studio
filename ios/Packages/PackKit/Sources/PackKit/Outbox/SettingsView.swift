import SwiftUI

public struct SettingsView: View {
    @AppStorage("outboxBaseURL") private var baseURL: String = "https://perfume-studio-indol.vercel.app"
    @State private var token: String = ""
    @Environment(\.dismiss) private var dismiss
    
    public init() {}
    
    public var body: some View {
        NavigationView {
            Form {
                Section(header: Text("שרת")) {
                    TextField("כתובת שרת", text: $baseURL)
                        #if os(iOS)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        #endif

                }
                Section(header: Text("אימות")) {
                    SecureField("Token", text: $token)
                }
            }
            .environment(\.layoutDirection, .rightToLeft)
            .navigationTitle("הגדרות")
            .toolbar {
                ToolbarItem(placement: .automatic) {
                    Button("שמור") {
                        KeychainHelper.shared.saveToken(token)
                        dismiss()
                    }
                }
            }
            .onAppear {
                token = KeychainHelper.shared.readToken()
            }
        }
    }
}
