import SwiftUI
@main struct NativeDemo: App {
    var body: some Scene {
        WindowGroup {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text("Your native workspace").font(.largeTitle)
                    Text("Captured components, connected to their own backend.")
                
ReframeNativeCommunity()

    ReframeNativeInterests()
  }.padding(24)
            }.frame(minWidth: 360, minHeight: 620)
        }
    }
}


struct ReframeNativeInterests: View {
@State private var checked:Set<String> = ["Design"]
private let choices = ["Design", "Engineering", "Research"]
private let primary = Color.accentColor
private var background:Color {
#if os(iOS)
return Color(uiColor:.systemBackground)
#else
return Color(nsColor:.windowBackgroundColor)
#endif
}
private let ink = Color.primary
var body:some View { VStack(alignment:.leading,spacing:16) {
ForEach(choices,id: \.self) { value in Toggle(value,isOn:Binding(get:{checked.contains(value)},set:{ enabled in if enabled { checked.insert(value) } else { checked.remove(value) } })) }
Text("\(checked.count) selected")
}.padding(20).frame(maxWidth:.infinity,alignment:.leading).font(.body).foregroundStyle(ink).tint(primary).background(background,in:RoundedRectangle(cornerRadius:12)) }

}
