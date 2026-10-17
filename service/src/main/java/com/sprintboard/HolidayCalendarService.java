package com.sprintboard;

import java.time.LocalDate;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Verified Turkish calendar; full-day treatment of half-days is this team's explicit policy. */
@Service
public class HolidayCalendarService {
  private final JdbcTemplate jdbc;
  public HolidayCalendarService(JdbcTemplate jdbc){this.jdbc=jdbc;}
  public record Holiday(LocalDate date,String title){}
  public static List<Holiday> holidays(int year){
    if(year!=2027&&year!=2028)throw new IllegalArgumentException("Desteklenen tatil yılları: 2027 ve 2028.");
    Map<LocalDate,String> dates=new TreeMap<>();
    String[][] fixed={{"01-01","Yılbaşı"},{"04-23","Ulusal Egemenlik ve Çocuk Bayramı"},{"05-01","Emek ve Dayanışma Günü"},{"05-19","Atatürk’ü Anma, Gençlik ve Spor Bayramı"},{"07-15","Demokrasi ve Millî Birlik Günü"},{"08-30","Zafer Bayramı"},{"10-28","Cumhuriyet Bayramı arifesi (resmî yarım gün · ekip kararı: tam gün)"},{"10-29","Cumhuriyet Bayramı"}};
    for(var row:fixed)dates.put(LocalDate.parse(year+"-"+row[0]),row[1]);
    String[] starts=year==2027?new String[]{"2027-03-09","2027-05-16"}:new String[]{"2028-02-26","2028-05-05"};
    for(int i=0;i<2;i++){
      LocalDate start=LocalDate.parse(starts[i]);String name=i==0?"Ramazan Bayramı":"Kurban Bayramı";
      dates.put(start.minusDays(1),name+" arifesi (resmî yarım gün · ekip kararı: tam gün)");
      for(int n=0;n<(i==0?3:4);n++)dates.merge(start.plusDays(n),name+" "+(n+1)+". gün",(a,b)->a+" / "+b);
    }
    return dates.entrySet().stream().map(e->new Holiday(e.getKey(),e.getValue())).toList();
  }
  @Transactional
  public Map<String,Object> importYear(int year){
    var holidays=holidays(year);
    // Serialize imports, including concurrent button clicks; preserve existing global and personal entries.
    jdbc.queryForObject("SELECT setting_value FROM product_setting WHERE setting_key='estimation_mode' FOR UPDATE",String.class);
    int added=0;
    for(var day:holidays){
      if(jdbc.queryForObject("SELECT COUNT(*) FROM non_working_day WHERE day_date=? AND member_id IS NULL",Integer.class,java.sql.Date.valueOf(day.date()))>0)continue;
      String id="tr-holiday-"+day.date();
      if(jdbc.queryForObject("SELECT COUNT(*) FROM non_working_day WHERE id=?",Integer.class,id)>0)throw new IllegalArgumentException("Tatil kimliği başka bir kayıtta kullanılıyor: "+id);
      jdbc.update("INSERT INTO non_working_day(id,day_date,title,member_id) VALUES (?,?,?,NULL)",id,java.sql.Date.valueOf(day.date()),day.title());added++;
    }
    if(added>0)jdbc.update("INSERT INTO audit_event(occurred_at,entity_type,entity_id,action,detail_json) VALUES (CURRENT_TIMESTAMP,'calendar',?,'turkey-holidays-imported',?)","tr-"+year,"{\"year\":"+year+",\"added\":"+added+",\"halfDayPolicy\":\"FULL_DAY\"}");
    return Map.of("year",year,"added",added,"existing",holidays.size()-added,"total",holidays.size());
  }
}
