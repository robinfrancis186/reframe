import { load } from 'cheerio';

export function nativeSources(html, spec) {
  const $ = load(html), text = $('h1,h2,h3,p,li').toArray().slice(0, 100).map(el => ({ text: $(el).text().slice(0, 2000), heading: /^h[123]$/.test(el.name) }));
  const encoded = Buffer.from(JSON.stringify(spec)).toString('base64');
  const paragraphs = Buffer.from(JSON.stringify(text)).toString('base64');
  const swift = `import SwiftUI

@MainActor struct ReframeFeature: View {
    var apiBase = URL(string: "http://127.0.0.1:5176")!
    @Environment(\\.openURL) private var openURL
    private let spec = try! JSONDecoder().decode(ReframeSpec.self, from: Data(base64Encoded: "${encoded}")!)
    private struct Copy: Decodable { let text: String; let heading: Bool }
    private let copy = try! JSONDecoder().decode([Copy].self, from: Data(base64Encoded: "${paragraphs}")!)
    @State private var data = ReframeSnapshot.empty
    @State private var values: [String: ReframeValue] = [:]
    @State private var selected = ""
    @State private var message = ""
    @State private var error = ""
    @State private var fingerprint = ""
    @State private var pending: ReframeRequest?
    @State private var busy = false
    @State private var ready = false
    @State private var sessionToken: String?
    @State private var accountUser: ReframeUser?
    @State private var accountEmail = ""
    @State private var accountPassword = ""
    @State private var credentials: [ReframeCredential] = []
    @State private var secrets: [String: String] = [:]
    private var client: ReframeClient { ReframeClient(baseURL: apiBase, featureID: spec.id, token: sessionToken) }
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            ForEach(Array(copy.enumerated()), id: \\.offset) { _, line in Text(line.text).font(line.heading ? .headline : .body) }
            if spec.authRequired == true {
                GroupBox("Account & API keys") {
                    VStack(alignment: .leading, spacing: 10) {
                        if let user = accountUser {
                            Text("Signed in as " + user.email)
                            Button("Sign out") { Task { await authenticate("signout") } }
                            ForEach(credentials) { credential in
                                Text(credential.name + (credential.configured ? " · Configured" : " · Not configured"))
                                Text(credential.method + " " + credential.endpoint).font(.caption)
                                SecureField("API key for " + credential.name, text: Binding(get: { secrets[credential.name] ?? "" }, set: { secrets[credential.name] = $0 }))
                                Button("Save API key") { Task { await saveKey(credential.name, value: secrets[credential.name] ?? "") } }.disabled((secrets[credential.name] ?? "").isEmpty)
                                if credential.configured { Button("Remove API key") { Task { await saveKey(credential.name, value: "") } } }
                            }
                        } else {
                            TextField("Account email", text: $accountEmail).accessibilityLabel("Account email")
                            SecureField("Account password", text: $accountPassword)
                            Text("Local account · password 12–128 characters. No email verification or password recovery.").font(.caption)
                            Button("Sign in") { Task { await authenticate("signin") } }
                            Button("Create account") { Task { await authenticate("signup") } }
                        }
                    }.disabled(busy)
                }
            }
            ForEach(spec.fields) { field in
                if field.type == "checkbox" {
                    Toggle(field.label, isOn: Binding(get: { values[field.id]?.flag ?? false }, set: { values[field.id] = .flag($0) }))
                } else if field.type == "password" {
                    SecureField(field.label, text: Binding(get: { values[field.id]?.text ?? "" }, set: { values[field.id] = .text($0) }))
                } else {
                    TextField(field.label, text: Binding(get: { values[field.id]?.text ?? "" }, set: { values[field.id] = .text($0) })).textFieldStyle(.roundedBorder).accessibilityLabel(field.label)
                }
            }.disabled(busy || (!ready && !spec.fields.contains { $0.type == "password" }))
            ForEach(spec.actions) { action in Button(action.label) { Task { await perform(action) } }.disabled(busy || (!ready && !["signin", "signup", "signout"].contains(action.operation))) }
            if !ready { Button("Retry loading") { Task { await load() } }.disabled(busy) }
            if busy { ProgressView() }
            if !message.isEmpty { Text(message).accessibilityAddTraits(.updatesFrequently) }
            if !error.isEmpty { Text(error).foregroundStyle(.red) }
            if let result = data.result { Text(result).font(.system(.caption, design: .monospaced)).textSelection(.enabled).accessibilityLabel("API response") }
            ForEach(spec.actions.filter { $0.operation == "toggle" || $0.operation == "increment" }) { action in
                Text(action.label + ": " + (action.operation == "increment" ? String(data.counters[action.id] ?? 0) : (data.toggles[action.id] == true ? "On" : "Off")))
            }
            if spec.actions.contains(where: { ["create", "update", "delete", "search"].contains($0.operation) }) {
                Text("Saved records: \\(data.records.count)").font(.headline)
                ForEach(data.records) { record in
                    let label = spec.fields.map { record.values[$0.id]?.text ?? "" }.filter { !$0.isEmpty }.joined(separator: " · ")
                    Button(label.isEmpty ? "Select record" : label) { selected = record.id; values = record.values; message = "Record selected." }.disabled(busy)
                }
            }
        }.task(id: apiBase) { ready = false; sessionToken = nil; accountUser = nil; credentials = []; secrets = [:]; if spec.authRequired == true { await refreshAccount() }; await load() }
    }
    private func refreshAccount() async {
        do { accountUser = try await client.account().user; credentials = accountUser == nil ? [] : try await client.credentials() }
        catch { self.error = error.localizedDescription }
    }
    private func authenticate(_ operation: String) async {
        busy = true; defer { busy = false }
        do { let account = try await client.account(operation: operation, email: accountEmail, password: accountPassword); sessionToken = account.token; accountUser = account.user; accountPassword = ""; secrets = [:]; pending = nil; data = .empty; reset(); ready = false; if account.user != nil { credentials = try await client.credentials(); data = try await client.request(); ready = true }; error = "" }
        catch { self.error = error.localizedDescription }
    }
    private func saveKey(_ name: String, value: String) async {
        busy = true; defer { busy = false }
        do { credentials = try await client.credentials(name: name, value: value); secrets[name] = ""; message = value.isEmpty ? "API key removed." : "API key saved on this server."; error = "" }
        catch { self.error = error.localizedDescription }
    }
    private func load() async {
        busy = true; defer { busy = false }
        do { data = try await client.request(); ready = true; error = ""; if values.isEmpty { reset() } }
        catch { self.error = error.localizedDescription }
    }
    private func reset() { values = Dictionary(uniqueKeysWithValues: spec.fields.map { ($0.id, $0.type == "checkbox" ? ReframeValue.flag(false) : .text("")) }); selected = "" }
    private func perform(_ action: ReframeAction) async {
        guard !busy, ready || ["signin", "signup", "signout"].contains(action.operation) else { return }; error = ""; message = ""
        if action.operation == "navigate" { if let url = URL(string: action.target, relativeTo: apiBase) { openURL(url) }; return }
        if action.operation == "details" { message = action.message; return }
        if action.operation == "reset" { reset(); return }
        if ["update", "delete"].contains(action.operation) && selected.isEmpty { error = "Select a saved record first."; return }
        let query = spec.fields.map { values[$0.id]?.text ?? "" }.joined(separator: " ")
        let encoder = JSONEncoder(); encoder.outputFormatting = .sortedKeys
        let key = action.id + selected + query + ((try? String(data: encoder.encode(values), encoding: .utf8)) ?? "")
        if key != fingerprint || pending == nil { fingerprint = key; pending = ReframeRequest(action: action.id, values: values, recordId: selected, query: query, version: data.version, requestId: UUID().uuidString) }
        guard let request = pending else { return }; busy = true; defer { busy = false }
        do { data = try await client.request(request); pending = nil; message = action.label + " completed."; if ["signin", "signup", "signout"].contains(action.operation) { sessionToken = data.token; reset(); await refreshAccount(); ready = accountUser != nil; if ready { data = try await client.request() } }; if ["create", "delete"].contains(action.operation) { reset() } }
        catch { self.error = error.localizedDescription; if let failure = error as? ReframeFailure, let status = failure.status, (400..<500).contains(status) { pending = nil }; if let latest = try? await client.request() { data = latest } }
    }
}
`;
  const java = `import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.*;
import org.json.*;
import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

public class ReframeFeatureView extends LinearLayout {
    private static class BackendFailure extends IOException { final int status; BackendFailure(int status,String message){super(message);this.status=status;} }
    private final String apiBase;
    private final JSONObject spec;
    private JSONObject data = new JSONObject();
    private final Map<String, android.view.View> fields = new LinkedHashMap<>();
    private final LinearLayout content, records;
    private final TextView status;
    private final List<Button> buttons = new ArrayList<>();
    private ExecutorService worker = Executors.newSingleThreadExecutor();
    private String selected = "", pendingKey = "", pendingBody = "";
    private boolean ready = false, busy = false;
    private String sessionToken = "";
    private LinearLayout account;
    private EditText accountEmail, accountPassword;
    private int primary=0xff3159e8, ink=0xff161a27, onPrimary=0xffffffff;
    public ReframeFeatureView(Context context, String apiBase) {
        super(context); this.apiBase = apiBase;
        try { spec = new JSONObject(new String(android.util.Base64.decode("${encoded}", 0), StandardCharsets.UTF_8)); }
        catch (JSONException error) { throw new IllegalArgumentException(error); }
        setOrientation(VERTICAL); setPadding(24, 24, 24, 24);
        content = new LinearLayout(context); content.setOrientation(VERTICAL); addView(content);
        status = new TextView(context); records = new LinearLayout(context); records.setOrientation(VERTICAL);
        if(spec.optBoolean("authRequired")){account=new LinearLayout(context);account.setOrientation(VERTICAL);content.addView(account);renderAccount(null,null);}
        try {
            JSONArray copy = new JSONArray(new String(android.util.Base64.decode("${paragraphs}", 0), StandardCharsets.UTF_8));
            for (int i=0;i<copy.length();i++) { JSONObject line=copy.getJSONObject(i); TextView label=new TextView(context); label.setText(line.getString("text")); label.setTextSize(line.getBoolean("heading")?22:16); content.addView(label); }
            JSONArray fs=spec.getJSONArray("fields");
            for (int i=0;i<fs.length();i++) { JSONObject f=fs.getJSONObject(i); android.view.View view;
                if(f.getString("type").equals("checkbox")){ CheckBox check=new CheckBox(context); check.setText(f.getString("label")); view=check; }
                else { EditText input=new EditText(context); input.setHint(f.getString("label")); input.setContentDescription(f.getString("label")); String type=f.getString("type"); input.setSaveEnabled(false); input.setInputType(type.equals("password")?129:type.equals("email")?33:type.equals("number")?8194:1); view=input; }
                fields.put(f.getString("id"),view); content.addView(view);
            }
            JSONArray actions=spec.getJSONArray("actions");
            for(int i=0;i<actions.length();i++){ final JSONObject action=actions.getJSONObject(i); Button button=new Button(context); button.setText(action.getString("label")); button.setOnClickListener(v->perform(action)); content.addView(button); buttons.add(button); }
        } catch(JSONException error){ throw new IllegalArgumentException(error); }
        content.addView(status); content.addView(records); load();
    }
    public void applyTheme(int primary,int ink,int onPrimary){this.primary=primary;this.ink=ink;this.onPrimary=onPrimary;tint(this);}
    private void tint(android.view.View view){if(view instanceof TextView)((TextView)view).setTextColor(ink);if(view instanceof Button && !(view instanceof CheckBox)){view.setBackgroundTintList(android.content.res.ColorStateList.valueOf(primary));((Button)view).setTextColor(onPrimary);}if(view instanceof EditText)view.setBackgroundTintList(android.content.res.ColorStateList.valueOf(primary));if(view instanceof android.view.ViewGroup){android.view.ViewGroup group=(android.view.ViewGroup)view;for(int i=0;i<group.getChildCount();i++)tint(group.getChildAt(i));}}
    private JSONObject request(String body) throws Exception { return request("",body); }
    private JSONObject request(String route,String body) throws Exception {
        URL url=new URL(apiBase+"/api/reframe/"+spec.getString("id")+route);
        if(!Arrays.asList("http","https").contains(url.getProtocol()) || url.getUserInfo()!=null)throw new IOException("Use an HTTP(S) backend without URL credentials.");
        HttpURLConnection connection=(HttpURLConnection)url.openConnection(); connection.setConnectTimeout(10000);connection.setReadTimeout(10000);connection.setInstanceFollowRedirects(false);
        connection.setRequestProperty("X-Reframe-Client","native");if(!sessionToken.isEmpty())connection.setRequestProperty("Authorization","Bearer "+sessionToken);
        try {
            if(body!=null){connection.setRequestMethod("POST");connection.setDoOutput(true);connection.setRequestProperty("Content-Type","application/json");try(OutputStream out=connection.getOutputStream()){out.write(body.getBytes(StandardCharsets.UTF_8));}}
            int code=connection.getResponseCode(); InputStream stream=code<400?connection.getInputStream():connection.getErrorStream();
            if(stream==null)throw new IOException("Backend returned HTTP "+code);
            ByteArrayOutputStream bytes=new ByteArrayOutputStream();try(InputStream in=stream){byte[] chunk=new byte[4096];int count;while((count=in.read(chunk))!=-1){bytes.write(chunk,0,count);if(bytes.size()>2000000)throw new IOException("Backend response too large");}}
            JSONObject result=new JSONObject(bytes.toString("UTF-8"));if(code<200||code>=300)throw new BackendFailure(code,result.optString("error","Backend unavailable")); return result;
        } finally{connection.disconnect();}
    }
    private boolean authForm(){for(android.view.View view:fields.values())if(view instanceof EditText&&(((EditText)view).getInputType()&128)!=0)return true;return false;}
    private void enabled(){for(Button button:buttons)button.setEnabled((ready||authForm())&&!busy);for(android.view.View field:fields.values())field.setEnabled((ready||authForm())&&!busy);for(int i=0;i<records.getChildCount();i++)records.getChildAt(i).setEnabled(ready&&!busy);if(account!=null)for(int i=0;i<account.getChildCount();i++)account.getChildAt(i).setEnabled(!busy);}
    private void renderAccount(JSONObject user,JSONArray keys){
        if(account==null)return;account.removeAllViews();TextView title=new TextView(getContext());title.setText("Account & API keys");account.addView(title);
        if(user==null){accountEmail=new EditText(getContext());accountEmail.setHint("Account email");accountEmail.setContentDescription("Account email");accountEmail.setInputType(33);account.addView(accountEmail);accountPassword=new EditText(getContext());accountPassword.setHint("Account password (12–128 characters)");accountPassword.setContentDescription("Account password");accountPassword.setInputType(129);accountPassword.setSaveEnabled(false);account.addView(accountPassword);for(String operation:new String[]{"signin","signup"}){Button button=new Button(getContext());button.setText(operation.equals("signin")?"Sign in":"Create account");button.setOnClickListener(v->authenticate(operation));account.addView(button);}}
        else{TextView identity=new TextView(getContext());identity.setText("Signed in as "+user.optString("email"));account.addView(identity);Button logout=new Button(getContext());logout.setText("Sign out");logout.setOnClickListener(v->authenticate("signout"));account.addView(logout);if(keys!=null)for(int i=0;i<keys.length();i++){JSONObject key=keys.optJSONObject(i);if(key==null)continue;String name=key.optString("name");TextView label=new TextView(getContext());label.setText(name+(key.optBoolean("configured")?" · Configured":" · Not configured"));account.addView(label);TextView destination=new TextView(getContext());destination.setText(key.optString("method")+" "+key.optString("endpoint"));account.addView(destination);EditText input=new EditText(getContext());input.setInputType(129);input.setSaveEnabled(false);input.setHint("API key for "+name);input.setContentDescription("API key for "+name);account.addView(input);Button save=new Button(getContext());save.setText("Save API key");save.setOnClickListener(v->saveKey(name,input.getText().toString()));account.addView(save);if(key.optBoolean("configured")){Button remove=new Button(getContext());remove.setText("Remove API key");remove.setOnClickListener(v->saveKey(name,""));account.addView(remove);}}}tint(account);
    }
    private void authenticate(String operation){if(busy)return;String email=accountEmail==null?"":accountEmail.getText().toString(),password=accountPassword==null?"":accountPassword.getText().toString();busy=true;enabled();worker.execute(()->{try{JSONObject result=request("/auth",new JSONObject().put("operation",operation).put("email",email).put("password",password).toString());sessionToken=result.optString("token","");JSONObject user=result.optJSONObject("user");JSONArray keys=user==null?null:request("/credentials",null).optJSONArray("keys");JSONObject latest=user==null?new JSONObject():request(null);post(()->{data=latest;ready=user!=null;busy=false;pendingBody="";reset();renderAccount(user,keys);if(ready)render("Signed in.");else{records.removeAllViews();enabled();status.setText("Signed out.");}});}catch(Exception error){post(()->{busy=false;enabled();status.setText(error.getMessage());});}});}
    private void saveKey(String name,String value){if(busy)return;busy=true;enabled();worker.execute(()->{try{JSONObject result=request("/credentials",new JSONObject().put("name",name).put("value",value).toString());JSONObject user=request("/auth",null).optJSONObject("user");post(()->{busy=false;renderAccount(user,result.optJSONArray("keys"));enabled();status.setText(value.isEmpty()?"API key removed.":"API key saved on this server.");});}catch(Exception error){post(()->{busy=false;enabled();status.setText(error.getMessage());});}});}
    private void load(){busy=true;enabled();status.setText("Loading feature…");worker.execute(()->{try{JSONObject result=request(null);post(()->{data=result;ready=true;busy=false;render("Ready");});}catch(Exception error){post(()->{busy=false;enabled();status.setText(error.getMessage());records.removeAllViews();Button retry=new Button(getContext());retry.setText("Retry loading");retry.setOnClickListener(v->load());records.addView(retry);});}});}
    private JSONObject values() throws JSONException {JSONObject result=new JSONObject();for(Map.Entry<String,android.view.View> field:fields.entrySet())result.put(field.getKey(),field.getValue() instanceof CheckBox?((CheckBox)field.getValue()).isChecked():((EditText)field.getValue()).getText().toString());return result;}
    private void reset(){selected="";for(android.view.View view:fields.values())if(view instanceof CheckBox)((CheckBox)view).setChecked(false);else((EditText)view).setText("");}
    private void perform(JSONObject action){
        if((!ready&&!authForm())||busy)return;
        try{
            String operation=action.getString("operation");
            if(operation.equals("navigate")){getContext().startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(new URI(apiBase).resolve(action.getString("target")).toString())));return;}
            if(operation.equals("details")){status.setText(action.getString("message"));return;}
            if(operation.equals("reset")){reset();return;}
            if(Arrays.asList("update","delete").contains(operation)&&selected.isEmpty()){status.setText("Select a saved record first.");return;}
            JSONObject values=values();StringBuilder query=new StringBuilder();for(String id:fields.keySet())query.append(values.get(id)).append(' ');
            String key=action.getString("id")+"|"+selected+"|"+values;
            if(!key.equals(pendingKey)||pendingBody.isEmpty()){pendingKey=key;pendingBody=new JSONObject().put("action",action.getString("id")).put("values",values).put("recordId",selected).put("query",query.toString().trim()).put("version",data.getInt("version")).put("requestId",UUID.randomUUID().toString()).toString();}
            final String body=pendingBody;busy=true;enabled();status.setText("Saving…");
            worker.execute(()->{try{JSONObject result=request(body);boolean auth=Arrays.asList("signin","signup","signout").contains(operation);if(auth)sessionToken=result.optString("token","");JSONObject user=auth?request("/auth",null).optJSONObject("user"):null;JSONArray keys=auth&&user!=null?request("/credentials",null).optJSONArray("keys"):null;JSONObject latest=auth&&user!=null?request(null):result;post(()->{data=latest;pendingBody="";busy=false;if(auth){ready=user!=null;reset();renderAccount(user,keys);}if(Arrays.asList("create","delete").contains(operation))reset();render(action.optString("label")+" completed.");});}catch(Exception error){JSONObject fresh=null;try{fresh=request(null);}catch(Exception ignored){}final JSONObject latest=fresh;post(()->{if(error instanceof BackendFailure&&((BackendFailure)error).status>=400&&((BackendFailure)error).status<500)pendingBody="";if(latest!=null)data=latest;busy=false;render(error.getMessage());});}});
        }catch(Exception error){status.setText(error.getMessage());}
    }
    private void render(String message){enabled();status.setText(message);records.removeAllViews();try{
        if(data.has("result")){TextView result=new TextView(getContext());result.setText(data.optString("result"));result.setTextIsSelectable(true);result.setContentDescription("API response");records.addView(result);}
        JSONArray actions=spec.getJSONArray("actions");for(int i=0;i<actions.length();i++){JSONObject action=actions.getJSONObject(i);String op=action.getString("operation"),id=action.getString("id");if(op.equals("toggle")||op.equals("increment")){TextView value=new TextView(getContext());value.setText(action.getString("label")+": "+(op.equals("toggle")?(data.getJSONObject("toggles").optBoolean(id)?"On":"Off"):data.getJSONObject("counters").optInt(id)));records.addView(value);}}
        JSONArray saved=data.getJSONArray("records");for(int i=0;i<saved.length();i++){final JSONObject record=saved.getJSONObject(i),values=record.getJSONObject("values");Button button=new Button(getContext());StringBuilder label=new StringBuilder();for(String id:fields.keySet())label.append(values.optString(id)).append(" · ");button.setText(label.length()>0?label.toString():"Select record");button.setOnClickListener(v->{selected=record.optString("id");for(Map.Entry<String,android.view.View> field:fields.entrySet())if(field.getValue() instanceof CheckBox)((CheckBox)field.getValue()).setChecked(values.optBoolean(field.getKey()));else((EditText)field.getValue()).setText(values.optString(field.getKey()));status.setText("Record selected.");});records.addView(button);}
    }catch(JSONException error){status.setText(error.getMessage());}tint(this);}
    @Override protected void onDetachedFromWindow(){super.onDetachedFromWindow();worker.shutdownNow();}
    @Override protected void onAttachedToWindow(){super.onAttachedToWindow();if(worker.isShutdown()){worker=Executors.newSingleThreadExecutor();load();}}
}
`;
  return { 'Component.swift': swift, 'ReframeFeatureView.java': java, 'Component.kt': `import androidx.compose.runtime.Composable\nimport androidx.compose.material3.MaterialTheme\nimport androidx.compose.ui.graphics.toArgb\nimport androidx.compose.ui.viewinterop.AndroidView\n\n@Composable fun ReframeFeature(apiBase: String = "http://10.0.2.2:5176") {\n    val colors = MaterialTheme.colorScheme\n    AndroidView(factory = { context -> ReframeFeatureView(context, apiBase) }, update = { it.applyTheme(colors.primary.toArgb(), colors.onSurface.toArgb(), colors.onPrimary.toArgb()) })\n}\n` };
}
