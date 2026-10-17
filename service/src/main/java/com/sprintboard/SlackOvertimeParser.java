package com.sprintboard;
import java.time.LocalDate;
import java.util.*;

/** A single day's actual overtime, never a capacity plan or an entitlement usage. */
public final class SlackOvertimeParser {
 public static final String EXAMPLE="#mesai\nSprint: 16\nTarih: 2026-10-17\nSaat: 2\nAçıklama: SAT defect çözümü";
 private static String unwrap(String value){
  String s=value.strip();
  for(String marker:List.of("```","**","*","`"))while(s.length()>marker.length()*2&&s.startsWith(marker)&&s.endsWith(marker)){
   String first=s.split("\\R",2)[0];
   if(!first.equals(s)&&first.endsWith(marker)&&!first.equals(marker))break;
   s=s.substring(marker.length(),s.length()-marker.length()).strip();
  }
  return s;
 }
 public static boolean matches(String raw){return matches(raw,"");}
 public static boolean matches(String raw,String channel){
  if(raw==null)return false;String first=unwrap(unwrap(raw).split("\\R",2)[0]);
  return first.equalsIgnoreCase("#mesai")||(!channel.isBlank()&&first.matches("<#"+java.util.regex.Pattern.quote(channel)+"(?:\\|[^>\\r\\n]+)?>"));
 }
 public static Map<String,Object> parse(String raw){return parse(raw,"");}
 public static Map<String,Object> parse(String raw,String channel){
  var out=new LinkedHashMap<String,Object>();var errors=new ArrayList<String>();var fields=new HashMap<String,String>();
  String safe=SlackDefectParser.safe(Objects.toString(raw,""));out.put("raw",safe.substring(0,Math.min(safe.length(),12000)));
  if(safe.length()>12000)errors.add("Mesaj en fazla 12.000 karakter olmalı.");
  if(!matches(safe,channel))errors.add("İlk satır #mesai olmalı.");
  var lines=unwrap(safe).split("\\R");
  for(int i=1;i<lines.length;i++){
   if(lines[i].isBlank())continue;String[] pair=unwrap(lines[i]).split(":",2);
   String key=unwrap(pair[0]).replace("*","").replace("`","").strip().toLowerCase(Locale.forLanguageTag("tr"));
   if(pair.length!=2||!Set.of("sprint","tarih","saat","açıklama").contains(key)){errors.add("Yalnız Sprint, Tarih, Saat ve Açıklama alanları kullanılabilir.");continue;}
   String value=unwrap(pair[1]);if(!key.equals("açıklama"))value=value.replace("*","").replace("`","").strip();
   if(fields.putIfAbsent(key,value)!=null)errors.add("Alan birden fazla yazılmış: "+key);
  }
  int sprint=0;double hours=0;String date=fields.getOrDefault("tarih",""),reason=fields.getOrDefault("açıklama","");
  try{sprint=Integer.parseInt(fields.getOrDefault("sprint","").replaceFirst("(?i)^sprint\\s+",""));if(sprint<1||sprint>100000)throw new IllegalArgumentException();}catch(Exception e){errors.add("Sprint pozitif bir sprint numarası olmalı.");}
  try{if(!date.matches("\\d{4}-\\d{2}-\\d{2}"))throw new IllegalArgumentException();LocalDate.parse(date);}catch(Exception e){errors.add("Tarih YYYY-AA-GG biçiminde geçerli bir gün olmalı.");}
  try{String value=fields.getOrDefault("saat","").replace(',','.');if(!value.matches("[0-9]+(?:\\.[0-9]{1,2})?"))throw new IllegalArgumentException();hours=Double.parseDouble(value);if(hours<=0||hours>24||hours*4!=Math.rint(hours*4))throw new IllegalArgumentException();}catch(Exception e){hours=0;errors.add("Saat 0,25–24 arasında, çeyrek saat adımlı olmalı.");}
  if(reason.isBlank()||reason.length()>1000)errors.add("Açıklama 1–1.000 karakter olmalı.");
  out.put("sprintNumber",sprint);out.put("date",date);out.put("hours",hours);out.put("reason",reason);out.put("errors",errors);out.put("valid",errors.isEmpty());return out;
 }
}
