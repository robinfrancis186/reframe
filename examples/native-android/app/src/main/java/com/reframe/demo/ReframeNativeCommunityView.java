package com.reframe.demo;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.*;
import org.json.*;
import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

public class ReframeNativeCommunityView extends LinearLayout {
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
    private int primary=0xff3159e8, ink=0xff161a27, onPrimary=0xffffffff;
    public ReframeNativeCommunityView(Context context, String apiBase) {
        super(context); this.apiBase = apiBase;
        try { spec = new JSONObject(new String(android.util.Base64.decode("eyJ2ZXJzaW9uIjoxLCJpZCI6InJmXzY1MjllZTkxNjVjNSIsIm5hbWUiOiJOYXRpdmUgY29tbXVuaXR5IiwiZmllbGRzIjpbeyJpZCI6ImZpZWxkMSIsImxhYmVsIjoiRW1haWwiLCJ0eXBlIjoiZW1haWwiLCJyZXF1aXJlZCI6dHJ1ZX1dLCJhY3Rpb25zIjpbeyJpZCI6ImFjdGlvbjEiLCJsYWJlbCI6IlNhdmUiLCJocmVmIjpudWxsLCJvcGVyYXRpb24iOiJjcmVhdGUiLCJ0YXJnZXQiOiIiLCJtZXNzYWdlIjoiIiwicmVhc29uIjoiU3VnZ2VzdGVkIGZyb20gdmlzaWJsZSBsYWJlbHMgb3IgbGlua3M7IHJldmlldyBiZWZvcmUgYnVpbGRpbmcuIn0seyJpZCI6ImFjdGlvbjIiLCJsYWJlbCI6IkNvdW50IiwiaHJlZiI6bnVsbCwib3BlcmF0aW9uIjoiaW5jcmVtZW50IiwidGFyZ2V0IjoiIiwibWVzc2FnZSI6IiIsInJlYXNvbiI6IlN1Z2dlc3RlZCBmcm9tIHZpc2libGUgbGFiZWxzIG9yIGxpbmtzOyByZXZpZXcgYmVmb3JlIGJ1aWxkaW5nLiJ9XX0=", 0), StandardCharsets.UTF_8)); }
        catch (JSONException error) { throw new IllegalArgumentException(error); }
        setOrientation(VERTICAL); setPadding(24, 24, 24, 24);
        content = new LinearLayout(context); content.setOrientation(VERTICAL); addView(content);
        status = new TextView(context); records = new LinearLayout(context); records.setOrientation(VERTICAL);
        try {
            JSONArray copy = new JSONArray(new String(android.util.Base64.decode("W3sidGV4dCI6Ik5hdGl2ZSBjb21tdW5pdHkiLCJoZWFkaW5nIjpmYWxzZX1d", 0), StandardCharsets.UTF_8));
            for (int i=0;i<copy.length();i++) { JSONObject line=copy.getJSONObject(i); TextView label=new TextView(context); label.setText(line.getString("text")); label.setTextSize(line.getBoolean("heading")?22:16); content.addView(label); }
            JSONArray fs=spec.getJSONArray("fields");
            for (int i=0;i<fs.length();i++) { JSONObject f=fs.getJSONObject(i); android.view.View view;
                if(f.getString("type").equals("checkbox")){ CheckBox check=new CheckBox(context); check.setText(f.getString("label")); view=check; }
                else { EditText input=new EditText(context); input.setHint(f.getString("label")); input.setContentDescription(f.getString("label")); String type=f.getString("type"); input.setInputType(type.equals("email")?33:type.equals("number")?8194:1); view=input; }
                fields.put(f.getString("id"),view); content.addView(view);
            }
            JSONArray actions=spec.getJSONArray("actions");
            for(int i=0;i<actions.length();i++){ final JSONObject action=actions.getJSONObject(i); Button button=new Button(context); button.setText(action.getString("label")); button.setOnClickListener(v->perform(action)); content.addView(button); buttons.add(button); }
        } catch(JSONException error){ throw new IllegalArgumentException(error); }
        content.addView(status); content.addView(records); load();
    }
    public void applyTheme(int primary,int ink,int onPrimary){this.primary=primary;this.ink=ink;this.onPrimary=onPrimary;tint(this);}
    private void tint(android.view.View view){if(view instanceof TextView)((TextView)view).setTextColor(ink);if(view instanceof Button && !(view instanceof CheckBox)){view.setBackgroundTintList(android.content.res.ColorStateList.valueOf(primary));((Button)view).setTextColor(onPrimary);}if(view instanceof EditText)view.setBackgroundTintList(android.content.res.ColorStateList.valueOf(primary));if(view instanceof android.view.ViewGroup){android.view.ViewGroup group=(android.view.ViewGroup)view;for(int i=0;i<group.getChildCount();i++)tint(group.getChildAt(i));}}
    private JSONObject request(String body) throws Exception {
        URL url=new URL(apiBase+"/api/reframe/"+spec.getString("id"));
        if(!Arrays.asList("http","https").contains(url.getProtocol()) || url.getUserInfo()!=null)throw new IOException("Use an HTTP(S) backend without URL credentials.");
        HttpURLConnection connection=(HttpURLConnection)url.openConnection(); connection.setConnectTimeout(10000);connection.setReadTimeout(10000);connection.setInstanceFollowRedirects(false);
        try {
            if(body!=null){connection.setRequestMethod("POST");connection.setDoOutput(true);connection.setRequestProperty("Content-Type","application/json");try(OutputStream out=connection.getOutputStream()){out.write(body.getBytes(StandardCharsets.UTF_8));}}
            int code=connection.getResponseCode(); InputStream stream=code<400?connection.getInputStream():connection.getErrorStream();
            if(stream==null)throw new IOException("Backend returned HTTP "+code);
            ByteArrayOutputStream bytes=new ByteArrayOutputStream();try(InputStream in=stream){byte[] chunk=new byte[4096];int count;while((count=in.read(chunk))!=-1){bytes.write(chunk,0,count);if(bytes.size()>2000000)throw new IOException("Backend response too large");}}
            JSONObject result=new JSONObject(bytes.toString("UTF-8"));if(code<200||code>=300)throw new BackendFailure(code,result.optString("error","Backend unavailable")); return result;
        } finally{connection.disconnect();}
    }
    private void enabled(){for(Button button:buttons)button.setEnabled(ready&&!busy);for(android.view.View field:fields.values())field.setEnabled(ready&&!busy);for(int i=0;i<records.getChildCount();i++)records.getChildAt(i).setEnabled(ready&&!busy);}
    private void load(){busy=true;enabled();status.setText("Loading feature…");worker.execute(()->{try{JSONObject result=request(null);post(()->{data=result;ready=true;busy=false;render("Ready");});}catch(Exception error){post(()->{busy=false;enabled();status.setText(error.getMessage());records.removeAllViews();Button retry=new Button(getContext());retry.setText("Retry loading");retry.setOnClickListener(v->load());records.addView(retry);});}});}
    private JSONObject values() throws JSONException {JSONObject result=new JSONObject();for(Map.Entry<String,android.view.View> field:fields.entrySet())result.put(field.getKey(),field.getValue() instanceof CheckBox?((CheckBox)field.getValue()).isChecked():((EditText)field.getValue()).getText().toString());return result;}
    private void reset(){selected="";for(android.view.View view:fields.values())if(view instanceof CheckBox)((CheckBox)view).setChecked(false);else((EditText)view).setText("");}
    private void perform(JSONObject action){
        if(!ready||busy)return;
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
            worker.execute(()->{try{JSONObject result=request(body);post(()->{data=result;pendingBody="";busy=false;if(Arrays.asList("create","delete").contains(operation))reset();render(action.optString("label")+" completed.");});}catch(Exception error){JSONObject fresh=null;try{fresh=request(null);}catch(Exception ignored){}final JSONObject latest=fresh;post(()->{if(error instanceof BackendFailure&&((BackendFailure)error).status>=400&&((BackendFailure)error).status<500)pendingBody="";if(latest!=null)data=latest;busy=false;render(error.getMessage());});}});
        }catch(Exception error){status.setText(error.getMessage());}
    }
    private void render(String message){enabled();status.setText(message);records.removeAllViews();try{
        JSONArray actions=spec.getJSONArray("actions");for(int i=0;i<actions.length();i++){JSONObject action=actions.getJSONObject(i);String op=action.getString("operation"),id=action.getString("id");if(op.equals("toggle")||op.equals("increment")){TextView value=new TextView(getContext());value.setText(action.getString("label")+": "+(op.equals("toggle")?(data.getJSONObject("toggles").optBoolean(id)?"On":"Off"):data.getJSONObject("counters").optInt(id)));records.addView(value);}}
        JSONArray saved=data.getJSONArray("records");for(int i=0;i<saved.length();i++){final JSONObject record=saved.getJSONObject(i),values=record.getJSONObject("values");Button button=new Button(getContext());StringBuilder label=new StringBuilder();for(String id:fields.keySet())label.append(values.optString(id)).append(" · ");button.setText(label.length()>0?label.toString():"Select record");button.setOnClickListener(v->{selected=record.optString("id");for(Map.Entry<String,android.view.View> field:fields.entrySet())if(field.getValue() instanceof CheckBox)((CheckBox)field.getValue()).setChecked(values.optBoolean(field.getKey()));else((EditText)field.getValue()).setText(values.optString(field.getKey()));status.setText("Record selected.");});records.addView(button);}
    }catch(JSONException error){status.setText(error.getMessage());}tint(this);}
    @Override protected void onDetachedFromWindow(){super.onDetachedFromWindow();worker.shutdownNow();}
    @Override protected void onAttachedToWindow(){super.onAttachedToWindow();if(worker.isShutdown()){worker=Executors.newSingleThreadExecutor();load();}}
}
