package com.sprintboard;

import java.nio.file.*;
import java.nio.file.attribute.*;
import java.security.SecureRandom;
import java.util.*;
import javax.crypto.Cipher;
import javax.crypto.spec.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** AES-GCM key lives outside the database; OCP should supply it as a Secret. Never log values. */
@Component
public class SlackSecretVault {
 private final Path file; private final String configured; private byte[] key;
 public SlackSecretVault(@Value("${sprintboard.slack.encryption-key:}") String configured,@Value("${sprintboard.slack.key-file:./service/data/slack-token.key}") String file){this.configured=configured;this.file=Path.of(file).toAbsolutePath().normalize();}
 private synchronized byte[] key(boolean create)throws Exception{
  if(key!=null)return key;
  if(!configured.isBlank())key=Base64.getDecoder().decode(configured);
  else if(Files.exists(file))key=Base64.getDecoder().decode(Files.readString(file).trim());
  else{
   if(!create)throw new IllegalStateException("Slack şifreleme anahtarı bulunamadı; anahtarı geri yükleyin veya tokenları silip yeniden girin.");
   byte[] fresh=new byte[32];new SecureRandom().nextBytes(fresh);Files.createDirectories(file.getParent());
   try{Files.createFile(file,PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rw-------")));}
   catch(UnsupportedOperationException e){Files.createFile(file);}
   try{var view=Files.getFileAttributeView(file,AclFileAttributeView.class);if(view!=null)view.setAcl(List.of(AclEntry.newBuilder().setType(AclEntryType.ALLOW).setPrincipal(Files.getOwner(file)).setPermissions(EnumSet.allOf(AclEntryPermission.class)).build()));Files.writeString(file,Base64.getEncoder().encodeToString(fresh),StandardOpenOption.WRITE);key=fresh;}
   catch(Exception e){Files.deleteIfExists(file);throw e;}
  }
  if(key.length!=32){key=null;throw new IllegalStateException("Slack şifreleme anahtarı 32 bayt olmalı.");}return key;
 }
 public String encrypt(String value){if(value.isEmpty())return "";try{byte[] nonce=new byte[12];new SecureRandom().nextBytes(nonce);var cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,new SecretKeySpec(key(true),"AES"),new GCMParameterSpec(128,nonce));return Base64.getEncoder().encodeToString(nonce)+":"+Base64.getEncoder().encodeToString(cipher.doFinal(value.getBytes(java.nio.charset.StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException("Slack tokenları güvenli kaydedilemedi; şifreleme anahtarı ayarını kontrol edin.");}}
 public String decrypt(String value){if(value.isEmpty())return "";try{String[] parts=value.split(":");var cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,new SecretKeySpec(key(false),"AES"),new GCMParameterSpec(128,Base64.getDecoder().decode(parts[0])));return new String(cipher.doFinal(Base64.getDecoder().decode(parts[1])),java.nio.charset.StandardCharsets.UTF_8);}catch(Exception e){throw new IllegalStateException("Kayıtlı Slack tokenları açılamadı; şifreleme anahtarını geri yükleyin veya tokenları silip yeniden girin.");}}
}
