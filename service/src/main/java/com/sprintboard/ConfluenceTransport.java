package com.sprintboard;

import com.fasterxml.jackson.databind.*;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;
import org.springframework.stereotype.Component;

/**
 * Only the configured Confluence base URL and the content REST paths; never logs the token.
 * Shares the corporate truststore with Jira because both live behind the same internal CA.
 */
@Component
public class ConfluenceTransport {
 /** Permanent rejection: retrying sends the same invalid payload, so the caller must stop. */
 public static class Rejected extends IllegalStateException { Rejected(String message){super(message);} }

 private static final int MAX_BODY=4_194_304;
 private final ObjectMapper mapper;
 private final HttpClient http;

 public ConfluenceTransport(ObjectMapper mapper){
  this.mapper=mapper;
  this.http=HttpClient.newBuilder().sslContext(JiraTransport.corporateTrust()).connectTimeout(Duration.ofSeconds(10)).followRedirects(HttpClient.Redirect.NEVER).build();
 }
 @jakarta.annotation.PreDestroy public void close(){http.shutdownNow();}

 static URI endpoint(String baseUrl,String path,Map<String,String> query){
  if(path.contains("..")||!path.startsWith("/rest/api/"))throw new IllegalArgumentException("Confluence adresi desteklenmiyor.");
  URI base;
  try{base=URI.create(baseUrl.endsWith("/")?baseUrl.substring(0,baseUrl.length()-1):baseUrl);}
  catch(Exception e){throw new IllegalArgumentException("Confluence adresi geçersiz.");}
  if(!"https".equals(base.getScheme())||base.getHost()==null||base.getUserInfo()!=null||base.getQuery()!=null||base.getFragment()!=null)throw new IllegalArgumentException("Confluence adresi https:// ile başlamalı ve yalnızca sunucu adresini içermeli.");
  String suffix=query.isEmpty()?"":"?"+query.entrySet().stream().map(e->URLEncoder.encode(e.getKey(),StandardCharsets.UTF_8)+"="+URLEncoder.encode(e.getValue(),StandardCharsets.UTF_8)).reduce((a,b)->a+"&"+b).orElse("");
  return URI.create(base+path+suffix);
 }

 public JsonNode get(String baseUrl,String token,String path,Map<String,String> query){return call("GET",baseUrl,token,path,query,null);}
 public JsonNode post(String baseUrl,String token,String path,JsonNode body){return call("POST",baseUrl,token,path,Map.of(),body);}
 public JsonNode put(String baseUrl,String token,String path,JsonNode body){return call("PUT",baseUrl,token,path,Map.of(),body);}

 private JsonNode call(String method,String baseUrl,String token,String path,Map<String,String> query,JsonNode body){
  var uri=endpoint(baseUrl,path,query);
  if(token.isBlank())throw new Rejected("Confluence kişisel erişim tokenı girilmemiş.");
  try{
   var builder=HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(30)).header("Authorization","Bearer "+token).header("Accept","application/json");
   if(body==null)builder.method(method,HttpRequest.BodyPublishers.noBody());
   else builder.header("Content-Type","application/json").method(method,HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body),StandardCharsets.UTF_8));
   var response=http.send(builder.build(),HttpResponse.BodyHandlers.ofInputStream());
   try(var stream=response.body()){
    byte[] data=stream.readNBytes(MAX_BODY+1);
    if(data.length>MAX_BODY)throw new Rejected("Confluence yanıtı boyut sınırını aştı.");
    return checked(response.statusCode(),data);
   }
  }catch(InterruptedException e){Thread.currentThread().interrupt();throw new IllegalStateException("Confluence bağlantısı durduruldu.");}
  catch(IllegalStateException|IllegalArgumentException e){throw e;}
  catch(Exception e){throw new IllegalStateException(reason(uri,e));}
 }

 /**
  * A single "could not connect" line sends people hunting through the network, the address and
  * the certificate at once; naming which of the three failed is usually the whole fix.
  */
 static String reason(URI uri,Exception e){
  String host=uri.getHost()==null?"":uri.getHost();
  if(e instanceof UnknownHostException)return "Confluence adresi çözülemedi: "+host+". Sunucu adını kontrol edin.";
  if(e instanceof javax.net.ssl.SSLException)return "Confluence sertifikasına güvenilmedi: "+host+". Kurumsal kök sertifikanın yüklü olduğunu kontrol edin.";
  if(e instanceof java.net.ConnectException)return "Confluence sunucusuna ulaşılamadı: "+host+". Ağ erişimini ve portu kontrol edin.";
  if(e instanceof java.net.http.HttpTimeoutException)return "Confluence zamanında yanıt vermedi: "+host+".";
  return "Confluence'a bağlanılamadı: "+host+". Ağ erişimini, sunucu adresini ve sertifika güvenini kontrol edin.";
 }

 private JsonNode checked(int status,byte[] data)throws Exception{
  JsonNode json;
  try{json=data.length==0?mapper.createObjectNode():mapper.readTree(data);}
  catch(Exception notJson){json=mapper.createObjectNode();}
  if(status>=200&&status<300)return json;
  if(status==401||status==403)throw new Rejected("Confluence tokenı geçersiz veya yetkisiz. Ayarlardan yeni bir token girin.");
  if(status==404)throw new Rejected("Confluence sayfası ya da alanı bulunamadı; alan anahtarını ve üst sayfa kimliğini kontrol edin.");
  if(status==409)throw new Rejected("Confluence sayfası bu arada değişmiş. Tekrar gönderin.");
  if(status>=500)throw new IllegalStateException("Confluence sunucusu yanıt veremedi; daha sonra tekrar deneyin.");
  throw new Rejected(detail(json));
 }

 /** Confluence puts the fixable part of a 400 in message, so surfacing it saves a support round. */
 static String detail(JsonNode json){
  String message=json.path("message").asText("");
  return message.isBlank()?"Confluence isteği reddetti.":"Confluence isteği reddetti — "+message;
 }
}
