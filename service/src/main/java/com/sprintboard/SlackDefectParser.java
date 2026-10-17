package com.sprintboard;

import java.text.Normalizer;
import java.util.*;
import java.util.regex.Pattern;

/** Deterministic preview only. Slack text is data, never executable instructions. */
public final class SlackDefectParser {
  public static final String DEFAULT_TEMPLATE="#defect\nTür: TEST,PROD\nBaşlık: OTP kodu gelmiyor\nOrtam: SAT,SIT,UAT,DEV,PROD\nÖnem: HIGH,MEDIUM,CRITICAL,LOW\nHedef: BACKLOG,SPRINT";
  private static final Map<String,Set<String>> SUPPORTED=Map.of("TUR",Set.of("TEST","PROD"),"ORTAM",Set.of("SAT","SIT","UAT","DEV","PROD","PREPROD","OTHER"),"ONEM",Set.of("HIGH","MEDIUM","CRITICAL","LOW"),"HEDEF",Set.of("BACKLOG","SPRINT"));
  public static Map<String,List<String>> template(String text){
    if(text==null||text.length()>2000||!matches(text))throw new IllegalArgumentException("Şablon #defect ile başlamalı; en fazla 2.000 karakter.");
    var result=new LinkedHashMap<String,List<String>>();boolean title=false;
    for(String line:text.lines().skip(1).toList()){
      if(line.isBlank())continue;int colon=line.indexOf(':');if(colon<0)throw new IllegalArgumentException("Şablon Alan: seçenekler biçiminde olmalı.");
      String k=key(line.substring(0,colon)),value=line.substring(colon+1).trim();
      if(k.equals("BASLIK")){if(title||value.isBlank()||value.length()>300)throw new IllegalArgumentException("Şablonda tek bir örnek başlık gerekli.");title=true;continue;}
      if(!SUPPORTED.containsKey(k)||result.containsKey(k))throw new IllegalArgumentException("Şablon alanları: Tür, Başlık, Ortam, Önem, Hedef. Her alan bir kez yazılmalı.");
      var options=Arrays.stream(value.split(",",-1)).map(SlackDefectParser::key).toList();
      if(options.isEmpty()||new HashSet<>(options).size()!=options.size()||!SUPPORTED.get(k).containsAll(options))throw new IllegalArgumentException(k+" seçenekleri geçersiz. Desteklenenler: "+String.join(", ",new TreeSet<>(SUPPORTED.get(k))));result.put(k,options);
    }
    if(!title||result.size()!=4)throw new IllegalArgumentException("Şablonda Tür, Başlık, Ortam, Önem ve Hedef bulunmalı.");return result;
  }
  @SuppressWarnings("unchecked") public static Map<String,Object> parse(String raw,String template){
    var options=template(template);var r=new LinkedHashMap<String,Object>(parse(raw));var errors=new ArrayList<>((List<String>)r.get("errors"));
    String type=r.get("taskSubtype").toString().replace("_DEFECT","");String target=r.get("target").toString();
    if(target.equals("AKTIF_SPRINT"))target="SPRINT";r.put("target",target);
    var values=Map.of("TUR",type,"ORTAM",r.get("environment").toString(),"ONEM",r.get("severity").toString(),"HEDEF",target);
    values.forEach((k,v)->{if(!options.get(k).contains(v))errors.add(k+" için yapılandırılmış seçeneklerden tek birini yazın: "+String.join(", ",options.get(k)));});
    for(String line:raw.lines().skip(1).toList()){if(line.isBlank())continue;int colon=line.indexOf(':');if(colon<0||!Set.of("TUR","BASLIK","ORTAM","ONEM","HEDEF").contains(key(line.substring(0,colon))))errors.add("Mesaj yalnız Tür, Başlık, Ortam, Önem ve Hedef alanlarını içermeli.");}
    r.put("errors",errors.stream().distinct().limit(12).toList());r.put("valid",errors.isEmpty());r.put("warnings",List.of("Admin onayı beklenir; kişi, tahmin ve efor otomatik atanmaz."));return r;
  }
  private SlackDefectParser() {}
  private static final Pattern TOKEN=Pattern.compile("(?i)(?:xox[baprs]-|xapp-)[A-Za-z0-9_-]+");
  public static String safe(String text){return TOKEN.matcher(text).replaceAll("[gizli anahtar gizlendi]");}
  private static String key(String text){return Normalizer.normalize(text.replace('ı','i'),Normalizer.Form.NFD).replaceAll("\\p{M}","").toUpperCase(Locale.ROOT).trim();}
  public static boolean matches(String text){return text.stripLeading().lines().findFirst().orElse("").strip().equalsIgnoreCase("#defect");}
  public static Map<String,Object> parse(String raw){
    String text=safe(raw);var errors=new ArrayList<String>();var fields=new LinkedHashMap<String,String>();
    if(!matches(text))errors.add("İlk satır #defect olmalı.");
    if(text.length()>12000){errors.add("Mesaj en fazla 12.000 karakter olabilir.");text=text.substring(0,12000);}
    String current="";
    for(String line:text.lines().skip(1).toList()){
      int colon=line.indexOf(':');String k=colon<0?"":key(line.substring(0,colon));
      if(Set.of("TUR","BASLIK","ORTAM","ONEM","HEDEF","ADIMLAR","BEKLENEN","GERCEKLESEN").contains(k)){
        if(fields.containsKey(k))errors.add("Alan birden fazla yazılmış: "+k);
        fields.put(k,line.substring(colon+1).trim());current=k;
      }else if(!line.isBlank()){
        if(Set.of("ADIMLAR","BEKLENEN","GERCEKLESEN").contains(current))fields.put(current,fields.get(current)+"\n"+line);
        else errors.add("Tanınmayan veya yanlış yerdeki satır; mesaj şablonunu kullanın.");
      }
    }
    String type=key(fields.getOrDefault("TUR","")),title=fields.getOrDefault("BASLIK",""),environment=key(fields.getOrDefault("ORTAM","")),severity=key(fields.getOrDefault("ONEM","")),target=key(fields.getOrDefault("HEDEF",""));
    if(!Set.of("TEST","PROD").contains(type))errors.add("Tür TEST veya PROD olmalı.");
    if(title.isBlank()||title.length()>300)errors.add("Başlık 1–300 karakter olmalı.");
    if(!Set.of("DEV","SIT","SAT","UAT","PREPROD","PROD","OTHER").contains(environment))errors.add("Ortam DEV, SIT, SAT, UAT, PREPROD, PROD veya OTHER olmalı.");
    if(!Set.of("CRITICAL","HIGH","MEDIUM","LOW").contains(severity))errors.add("Önem CRITICAL, HIGH, MEDIUM veya LOW olmalı.");
    if(!Set.of("BACKLOG","SPRINT","AKTIF_SPRINT").contains(target))errors.add("Hedef BACKLOG veya SPRINT olmalı.");
    var result=new LinkedHashMap<String,Object>();result.put("valid",errors.isEmpty());result.put("errors",errors.stream().distinct().limit(12).toList());
    result.put("title",title);result.put("taskCategory","DEFECT");result.put("taskSubtype",Set.of("TEST","PROD").contains(type)?type+"_DEFECT":"");result.put("environment",environment);result.put("severity",severity);result.put("target",target);
    result.put("steps",fields.getOrDefault("ADIMLAR",""));result.put("expected",fields.getOrDefault("BEKLENEN",""));result.put("actual",fields.getOrDefault("GERCEKLESEN",""));
    result.put("raw",text);result.put("warnings",List.of("Yalnız önizleme; iş oluşturulmadı. Kişi, Size ve efor atanmadı."));return result;
  }
}
