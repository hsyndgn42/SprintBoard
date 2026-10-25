package com.sprintboard;

import com.fasterxml.jackson.databind.*;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.time.Duration;
import java.util.*;
import javax.net.ssl.*;
import org.springframework.stereotype.Component;

/**
 * Only the configured Jira base URL and a fixed set of REST paths; never logs the token.
 * Jira Data Center allows one request per second, so every call funnels through here.
 */
@Component
public class JiraTransport {
 public static class RateLimited extends IllegalStateException {
  public final long seconds;
  RateLimited(long seconds){super("Jira istek sınırı aşıldı; işlem biraz sonra devam edecek.");this.seconds=Math.max(1,seconds);}
 }
 /** Permanent rejection: retrying sends the same invalid payload, so the caller must stop. */
 public static class Rejected extends IllegalStateException { Rejected(String message){super(message);} }

 private static final long MIN_INTERVAL_MS=1100;
 private static final int MAX_BODY=4_194_304;
 private final ObjectMapper mapper;
 private final HttpClient http;
 private long lastCall;

 public JiraTransport(ObjectMapper mapper){
  this.mapper=mapper;
  this.http=HttpClient.newBuilder().sslContext(corporateTrust()).connectTimeout(Duration.ofSeconds(10)).followRedirects(HttpClient.Redirect.NEVER).build();
 }
 @jakarta.annotation.PreDestroy public void close(){http.shutdownNow();}

 /**
  * curl reaches Jira because Windows holds the corporate roots while the JDK only reads its own
  * cacerts. This context is handed to the Jira client alone; changing the JVM-wide truststore
  * would strip the public roots that SlackTransport needs for slack.com.
  */
 static SSLContext corporateTrust(){
  try{
   KeyStore store=KeyStore.getInstance("PKCS12");store.load(null,null);
   int loaded=0;
   for(String source:new String[]{"Windows-ROOT","Windows-MY"}){
    try{
     KeyStore windows=KeyStore.getInstance(source);windows.load(null,null);
     for(String alias:Collections.list(windows.aliases())){
      var certificate=windows.getCertificate(alias);
      if(certificate!=null)store.setCertificateEntry(source+"-"+(loaded++),certificate);
     }
    }catch(Exception outsideWindows){/* Not a Windows host; fall back to the platform default. */}
   }
   if(loaded==0)return SSLContext.getDefault();
   var factory=TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());factory.init(store);
   var context=SSLContext.getInstance("TLS");context.init(null,factory.getTrustManagers(),null);return context;
  }catch(Exception e){
   try{return SSLContext.getDefault();}catch(Exception fatal){throw new IllegalStateException("Jira için TLS ayarı kurulamadı.");}
  }
 }

 static URI endpoint(String baseUrl,String path,Map<String,String> query){
  if(path.contains("..")||!(path.startsWith("/rest/api/2/")||path.startsWith("/rest/agile/1.0/")))throw new IllegalArgumentException("Jira adresi desteklenmiyor.");
  URI base;
  try{base=URI.create(baseUrl.endsWith("/")?baseUrl.substring(0,baseUrl.length()-1):baseUrl);}
  catch(Exception e){throw new IllegalArgumentException("Jira adresi geçersiz.");}
  if(!"https".equals(base.getScheme())||base.getHost()==null||base.getUserInfo()!=null||base.getQuery()!=null||base.getFragment()!=null)throw new IllegalArgumentException("Jira adresi https:// ile başlamalı ve yalnızca sunucu adresini içermeli.");
  String suffix=query.isEmpty()?"":"?"+query.entrySet().stream().map(e->URLEncoder.encode(e.getKey(),StandardCharsets.UTF_8)+"="+URLEncoder.encode(e.getValue(),StandardCharsets.UTF_8)).reduce((a,b)->a+"&"+b).orElse("");
  return URI.create(base+path+suffix);
 }

 public JsonNode get(String baseUrl,String token,String path,Map<String,String> query){return call(baseUrl,token,path,query,null);}
 public JsonNode post(String baseUrl,String token,String path,JsonNode body){return call(baseUrl,token,path,Map.of(),body);}

 private JsonNode call(String baseUrl,String token,String path,Map<String,String> query,JsonNode body){
  var uri=endpoint(baseUrl,path,query);
  if(token.isBlank())throw new Rejected("Jira kişisel erişim tokenı girilmemiş.");
  throttle();
  try{
   var builder=HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(30)).header("Authorization","Bearer "+token).header("Accept","application/json");
   if(body==null)builder.GET();
   else builder.header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body),StandardCharsets.UTF_8));
   var response=http.send(builder.build(),HttpResponse.BodyHandlers.ofInputStream());
   try(var stream=response.body()){
    if(response.statusCode()==429)throw new RateLimited(response.headers().firstValueAsLong("Retry-After").orElse(5));
    byte[] data=stream.readNBytes(MAX_BODY+1);
    if(data.length>MAX_BODY)throw new Rejected("Jira yanıtı boyut sınırını aştı.");
    return checked(response.statusCode(),data);
   }
  }catch(InterruptedException e){Thread.currentThread().interrupt();throw new IllegalStateException("Jira bağlantısı durduruldu.");}
  catch(IllegalStateException|IllegalArgumentException e){throw e;}
  catch(Exception e){throw new IllegalStateException("Jira'ya bağlanılamadı. Ağ erişimini, sunucu adresini ve sertifika güvenini kontrol edin.");}
 }

 /** Serialises callers because Jira Data Center answers 429 above one request per second. */
 private synchronized void throttle(){
  long wait=lastCall+MIN_INTERVAL_MS-System.currentTimeMillis();
  if(wait>0){try{Thread.sleep(wait);}catch(InterruptedException e){Thread.currentThread().interrupt();throw new IllegalStateException("Jira bağlantısı durduruldu.");}}
  lastCall=System.currentTimeMillis();
 }

 private JsonNode checked(int status,byte[] data)throws Exception{
  JsonNode json;
  try{json=data.length==0?mapper.createObjectNode():mapper.readTree(data);}
  catch(Exception notJson){json=mapper.createObjectNode();}
  if(status>=200&&status<300)return json;
  if(status==401||status==403)throw new Rejected("Jira tokenı geçersiz veya yetkisiz. Ayarlardan yeni bir token girin.");
  if(status==404)throw new Rejected("Jira kaydı bulunamadı ya da görme yetkiniz yok.");
  if(status>=500)throw new IllegalStateException("Jira sunucusu yanıt veremedi; daha sonra tekrar denenecek.");
  throw new Rejected(detail(json));
 }

 /** Jira reports field problems inside the body, and that detail is what makes a 400 fixable. */
 static String detail(JsonNode json){
  var parts=new ArrayList<String>();
  json.path("errorMessages").forEach(node->parts.add(node.asText()));
  var errors=json.path("errors");
  errors.fieldNames().forEachRemaining(field->parts.add(field+": "+errors.path(field).asText()));
  return parts.isEmpty()?"Jira isteği reddetti.":"Jira isteği reddetti — "+String.join(" | ",parts);
 }
}
