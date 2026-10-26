package com.sprintboard;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ConfluenceConfigStore {
 private final JdbcTemplate db; private final JiraSecretVault vault;
 public ConfluenceConfigStore(JdbcTemplate db,JiraSecretVault vault){this.db=db;this.vault=vault;}

 /** patConfigured replaces the token itself; the secret never travels back to the browser. */
 public record Config(String baseUrl,String spaceKey,String parentPageId,boolean enabled,int version,boolean patConfigured){}

 public Config load(){
  var rows=db.query("SELECT * FROM confluence_config WHERE id=1",(r,n)->new Config(JiraConfigStore.trimUrl(r.getString("base_url")),r.getString("space_key"),r.getString("parent_page_id"),r.getBoolean("enabled"),r.getInt("version"),!r.getString("pat_secret").isBlank()));
  return rows.isEmpty()?new Config("","","",false,0,false):rows.getFirst();
 }

 public String token(){
  var rows=db.query("SELECT pat_secret FROM confluence_config WHERE id=1",(r,n)->r.getString("pat_secret"));
  if(rows.isEmpty()||rows.getFirst().isBlank())throw new IllegalArgumentException("Confluence kişisel erişim tokenı girilmemiş.");
  return vault.decrypt(rows.getFirst());
 }

 @Transactional public int save(Config c,String pat){
  String baseUrl=JiraConfigStore.trimUrl(c.baseUrl()),space=c.spaceKey().trim().toUpperCase(java.util.Locale.ROOT),parent=c.parentPageId().trim();
  if(!baseUrl.isEmpty()&&!baseUrl.startsWith("https://"))throw new IllegalArgumentException("Confluence adresi https:// ile başlamalı.");
  if(!space.isEmpty()&&!space.matches("[A-Z0-9~][A-Z0-9_.-]{0,40}"))throw new IllegalArgumentException("Confluence alan (space) anahtarı geçersiz. Örn. VIBE");
  if(!parent.isEmpty()&&!parent.matches("[0-9]{1,18}"))throw new IllegalArgumentException("Üst sayfa kimliği yalnız rakamlardan oluşmalı.");
  if(c.enabled()&&(baseUrl.isEmpty()||space.isEmpty()))throw new IllegalArgumentException("Entegrasyonu açmadan önce Confluence adresi ve alan anahtarı girilmeli.");
  if(c.version()==0){
   if(c.enabled()&&pat.isBlank())throw new IllegalArgumentException("Entegrasyonu açmadan önce bir token girilmeli.");
   try{db.update("INSERT INTO confluence_config(id,base_url,space_key,parent_page_id,pat_secret,enabled,version) VALUES(1,?,?,?,?,?,1)",baseUrl,space,parent,vault.encrypt(pat),c.enabled());}
   catch(org.springframework.dao.DuplicateKeyException e){throw new IllegalArgumentException("Confluence ayarları değişti; sayfayı yenileyin.");}
   return 1;
  }
  // An empty token means "leave it as it is"; the form never receives the stored value back.
  int updated=pat.isBlank()
   ?db.update("UPDATE confluence_config SET base_url=?,space_key=?,parent_page_id=?,enabled=?,version=version+1 WHERE id=1 AND version=?",baseUrl,space,parent,c.enabled(),c.version())
   :db.update("UPDATE confluence_config SET base_url=?,space_key=?,parent_page_id=?,pat_secret=?,enabled=?,version=version+1 WHERE id=1 AND version=?",baseUrl,space,parent,vault.encrypt(pat),c.enabled(),c.version());
  if(updated!=1)throw new IllegalArgumentException("Confluence ayarları değişti; sayfayı yenileyin.");
  if(c.enabled()&&pat.isBlank()&&!load().patConfigured())throw new IllegalArgumentException("Entegrasyonu açmadan önce bir token girilmeli.");
  return c.version()+1;
 }

 public void forget(){db.update("UPDATE confluence_config SET pat_secret='',enabled=false,version=version+1 WHERE id=1");}
}
