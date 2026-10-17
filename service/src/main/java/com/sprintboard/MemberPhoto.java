package com.sprintboard;

import java.io.*;
import java.util.*;
import javax.imageio.ImageIO;
import com.fasterxml.jackson.databind.JsonNode;

/** Raster-only allowlist, bounded before decode. Re-encoding strips metadata and embedded content. */
public final class MemberPhoto {
  private MemberPhoto(){}
  public static String normalize(String data){
    if(data==null||data.isBlank())return "";
    try{
      if(data.length()>360_000||!data.matches("data:image/(png|jpeg);base64,[A-Za-z0-9+/=]+"))throw new IOException();
      byte[] bytes=Base64.getDecoder().decode(data.substring(data.indexOf(',')+1));if(bytes.length>256_000)throw new IOException();
      try(var stream=ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))){
        var readers=ImageIO.getImageReaders(stream);if(!readers.hasNext())throw new IOException();var reader=readers.next();
        try{reader.setInput(stream);String format=reader.getFormatName().toLowerCase(Locale.ROOT);if(!Set.of("png","jpeg","jpg").contains(format)||reader.getWidth(0)>1024||reader.getHeight(0)>1024||reader.getWidth(0)<1||reader.getHeight(0)<1)throw new IOException();
          var image=reader.read(0);var out=new ByteArrayOutputStream();ImageIO.write(image,"png",out);if(out.size()>256_000)throw new IOException();return "data:image/png;base64,"+Base64.getEncoder().encodeToString(out.toByteArray());
        }finally{reader.dispose();}
      }
    }catch(Exception e){throw new IllegalArgumentException("Fotoğraf PNG/JPEG, en fazla 256 KB ve 1024 × 1024 piksel olmalı. Ekrandan yüklenen fotoğraf otomatik küçültülür.");}
  }
  public static void validateBackup(JsonNode tables){for(var row:tables.path("member_photo")){if(!row.path("image_data").isTextual()||row.path("image_data").asText().isBlank())throw new IllegalArgumentException("Fotoğraf verisi eksik.");normalize(row.path("image_data").asText());}}
}
