package com.sprintboard;

import java.text.Normalizer;
import java.util.*;

/** Explicit structured requests, never instructions to execute. */
public final class SlackBacklogParser {
 public static final String DEFAULT_TEMPLATE="#backlog\nTür: DEV,DESIGN,ANALYZE,TEST,BAU\nBaşlık: İşin kısa başlığı\nAçıklama: İhtiyacı ve beklenen sonucu yazın";
 public static final Set<String> CATEGORIES=Set.of("DEV","DESIGN","ANALYZE","TEST","BAU");
 private SlackBacklogParser(){}
 static String key(String value){return Normalizer.normalize(value.replace('ı','i'),Normalizer.Form.NFD).replaceAll("\\p{M}","").toUpperCase(Locale.ROOT).trim();}
 static String unwrap(String value){String s=value.strip();for(String marker:List.of("```","**","*","`"))while(s.length()>marker.length()*2&&s.startsWith(marker)&&s.endsWith(marker)){String first=s.split("\\R",2)[0];if(!first.equals(s)&&first.endsWith(marker)&&!first.equals(marker))break;s=s.substring(marker.length(),s.length()-marker.length()).strip();}return s;}
 public static boolean matches(String text,String channel){if(text==null)return false;String first=unwrap(unwrap(text).split("\\R",2)[0]);return first.equalsIgnoreCase("#backlog")||(!channel.isBlank()&&first.matches("<#"+java.util.regex.Pattern.quote(channel)+"(?:\\|[^>\\r\\n]+)?>"));}
 public static List<String> template(String value){
  if(value==null||value.length()>2000||!matches(value,""))throw new IllegalArgumentException("Şablon #backlog ile başlamalı; en fazla 2.000 karakter.");
  var fields=new LinkedHashMap<String,String>();
  for(String line:value.lines().skip(1).toList()){if(line.isBlank())continue;int colon=line.indexOf(':');if(colon<0)throw new IllegalArgumentException("Şablon Alan: değer biçiminde olmalı.");String k=key(line.substring(0,colon)),v=line.substring(colon+1).strip();if(!Set.of("TUR","BASLIK","ACIKLAMA").contains(k)||v.isBlank()||fields.putIfAbsent(k,v)!=null)throw new IllegalArgumentException("Şablonda Tür, Başlık ve Açıklama birer kez bulunmalı.");}
  if(fields.size()!=3)throw new IllegalArgumentException("Şablonda Tür, Başlık ve Açıklama gerekli.");
  var options=Arrays.stream(fields.get("TUR").split(",",-1)).map(SlackBacklogParser::key).toList();
  if(new HashSet<>(options).size()!=options.size()||!CATEGORIES.containsAll(options))throw new IllegalArgumentException("Tür seçenekleri DEV, DESIGN, ANALYZE, TEST, BAU arasından seçilmeli.");return options;
 }
 public static Map<String,Object> parse(String raw,String schema,String channel){
  var options=template(schema);String text=SlackDefectParser.safe(Objects.toString(raw,""));var errors=new ArrayList<String>();
  if(text.length()>12000){errors.add("Mesaj en fazla 12.000 karakter olmalı.");text=text.substring(0,12000);}
  if(!matches(text,channel))errors.add("İlk satır #backlog olmalı.");
  var fields=new LinkedHashMap<String,String>();String current="";
  for(String line:unwrap(text).lines().skip(1).toList()){
   if(line.isBlank())continue;String clean=unwrap(line);int colon=clean.indexOf(':');String k=colon<0?"":key(unwrap(clean.substring(0,colon)).replace("*","").replace("`",""));
   if(Set.of("TUR","BASLIK","ACIKLAMA").contains(k)){
    if(fields.containsKey(k))errors.add("Alan birden fazla yazılmış: "+k);
    String value=clean.substring(colon+1).strip(),label=clean.substring(0,colon).strip();
    for(String marker:List.of("**","*","`"))if(label.startsWith(marker)&&value.startsWith(marker)){value=value.substring(marker.length()).strip();break;}
    fields.put(k,unwrap(value));current=k;
   }
   else if(current.equals("ACIKLAMA"))fields.put(current,fields.get(current)+"\n"+clean);
   else errors.add("Tanınmayan alan; Tür, Başlık ve Açıklama kullanın.");
  }
  String category=key(fields.getOrDefault("TUR","")),title=fields.getOrDefault("BASLIK",""),description=fields.getOrDefault("ACIKLAMA","");
  if(!options.contains(category))errors.add("Tür için tek seçenek yazın: "+String.join(", ",options));
  if(title.isBlank()||title.length()>300)errors.add("Başlık 1–300 karakter olmalı.");
  if(description.isBlank()||description.length()>8000)errors.add("Açıklama 1–8.000 karakter olmalı.");
  return Map.of("valid",errors.isEmpty(),"errors",errors.stream().distinct().limit(12).toList(),"title",title,"description",description,"taskCategory",category,"raw",text);
 }
}
