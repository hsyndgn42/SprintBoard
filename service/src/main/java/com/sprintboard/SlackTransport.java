package com.sprintboard;

import com.fasterxml.jackson.databind.*;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import org.springframework.stereotype.Component;

/** Only fixed Slack API endpoints; never logs request tokens, responses or socket URLs. */
@Component
public class SlackTransport {
  public static class RateLimited extends IllegalStateException {
    public final long seconds;
    RateLimited(long seconds){super("Slack istek sınırı; tarama daha sonra devam edecek.");this.seconds=Math.max(60,seconds);}
  }
  public static class InvalidCursor extends IllegalStateException { InvalidCursor(){super("Slack sayfalama imleci yenilenecek.");} }
  private final ObjectMapper mapper;
  private final HttpClient http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).followRedirects(HttpClient.Redirect.NEVER).build();
  public SlackTransport(ObjectMapper mapper){this.mapper=mapper;}
  @jakarta.annotation.PreDestroy public void close(){http.shutdownNow();}
  public JsonNode call(String method,String token,Map<String,String> fields){
    if(!Set.of("auth.test","conversations.history","apps.connections.open","users.info","files.getUploadURLExternal","files.completeUploadExternal","reactions.add").contains(method))throw new IllegalArgumentException("Slack işlemi desteklenmiyor.");
    String form=fields.entrySet().stream().map(e->URLEncoder.encode(e.getKey(),StandardCharsets.UTF_8)+"="+URLEncoder.encode(e.getValue(),StandardCharsets.UTF_8)).collect(java.util.stream.Collectors.joining("&"));
    try{
      var request=HttpRequest.newBuilder(URI.create("https://slack.com/api/"+method)).timeout(Duration.ofSeconds(15)).header("Authorization","Bearer "+token).header("Content-Type","application/x-www-form-urlencoded").POST(HttpRequest.BodyPublishers.ofString(form)).build();
      var response=http.send(request,HttpResponse.BodyHandlers.ofInputStream());
      try(var body=response.body()){
        if(response.statusCode()==429)throw new RateLimited(response.headers().firstValueAsLong("Retry-After").orElse(60));
        if(response.statusCode()!=200)throw new IllegalStateException("Slack HTTP bağlantısı başarısız.");
        byte[] data=body.readNBytes(262145);if(data.length>262144)throw new IllegalStateException("Slack yanıtı sınırı aştı.");
        return checkedResponse(method,mapper.readTree(data));
      }
    }catch(InterruptedException e){Thread.currentThread().interrupt();throw new IllegalStateException("Slack bağlantısı durduruldu.");}
    catch(IllegalStateException e){throw e;}
    catch(Exception e){throw new IllegalStateException("Slack'e bağlanılamadı. Ağ/proxy, TLS ve token ayarlarını kontrol edin.");}
  }
  static JsonNode checkedResponse(String method,JsonNode json){
    if("invalid_cursor".equals(json.path("error").asText()))throw new InvalidCursor();
    if(!json.path("ok").asBoolean()&&!("reactions.add".equals(method)&&"already_reacted".equals(json.path("error").asText())))throw new IllegalStateException(error(json.path("error").asText()));
    return json;
  }
  static String error(String code){return switch(code){
    case "invalid_auth","not_authed","token_revoked","account_inactive"->"Slack token geçersiz veya iptal edilmiş.";
    case "missing_scope","not_allowed_token_type"->"Slack token yetkisi uygun değil. Alındı tiki için reactions:write; HTML için files:write; okuma için kanal izinleri; Socket Mode için connections:write gerekir. İzin sonrası Reinstall to Workspace yapın.";
    case "not_in_channel","channel_not_found"->"Kanal okunamıyor. Botu seçili kanala ekleyin ve kanal iznini kontrol edin.";
    case "not_allowed"->"Slack yönetim politikası bağlantıya izin vermiyor.";
    default->"Slack isteği reddetti; uygulama izinlerini kontrol edin.";};}
  static URI socketUri(String url){
    URI uri;try{uri=URI.create(url);}catch(Exception e){throw new IllegalStateException("Geçersiz Slack socket adresi.");}
    String host=uri.getHost();
    if(!"wss".equals(uri.getScheme())||host==null||!host.endsWith(".slack.com")||uri.getUserInfo()!=null||(uri.getPort()!=-1&&uri.getPort()!=443)||uri.getFragment()!=null)throw new IllegalStateException("Güvenilmeyen Slack socket adresi.");
    return uri;
  }
  public WebSocket open(String url,WebSocket.Listener listener){
    try{return http.newWebSocketBuilder().connectTimeout(Duration.ofSeconds(15)).buildAsync(socketUri(url),listener).get(20,TimeUnit.SECONDS);}
    catch(InterruptedException e){Thread.currentThread().interrupt();throw new IllegalStateException("Slack bağlantısı durduruldu.");}
    catch(Exception e){throw new IllegalStateException("Slack WebSocket bağlantısı kurulamadı. Ağın WSS çıkış iznini kontrol edin.");}
  }
  static URI uploadUri(String url){
    URI uri;try{uri=URI.create(url);}catch(Exception e){throw new IllegalStateException("Geçersiz Slack dosya adresi.");}
    if(!"https".equals(uri.getScheme())||!"files.slack.com".equals(uri.getHost())||uri.getUserInfo()!=null||(uri.getPort()!=-1&&uri.getPort()!=443)||uri.getFragment()!=null||!uri.getPath().startsWith("/upload/"))throw new IllegalStateException("Güvenilmeyen Slack dosya adresi.");
    return uri;
  }
  public void upload(String url,byte[] content){
    if(content.length>5_000_000)throw new IllegalArgumentException("Review HTML dosyası 5 MB sınırını aşıyor.");
    var uri=uploadUri(url);
    try{
      // This pre-signed address must never receive the bot token or follow redirects.
      var response=http.send(HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(30)).header("Content-Type","application/octet-stream").POST(HttpRequest.BodyPublishers.ofByteArray(content)).build(),HttpResponse.BodyHandlers.ofInputStream());
      try(var body=response.body()){if(response.statusCode()!=200)throw new IllegalStateException("Slack HTML yüklemesini kabul etmedi.");}
    }catch(InterruptedException e){Thread.currentThread().interrupt();throw new IllegalStateException("Slack dosya yüklemesi durduruldu.");}
    catch(IllegalStateException e){throw e;}
    catch(Exception e){throw new IllegalStateException("Slack dosyası yüklenemedi; ağ bağlantısını kontrol edin.");}
  }
}
