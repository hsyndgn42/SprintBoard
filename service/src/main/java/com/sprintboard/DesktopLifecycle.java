package com.sprintboard;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/** Only the Windows launcher owns this private stdin pipe. Normal server installs are unaffected. */
@Component
@ConditionalOnProperty(name="sprintboard.desktop.managed",havingValue="true")
public class DesktopLifecycle {
  private final ConfigurableApplicationContext context;
  private final AtomicBoolean started=new AtomicBoolean();
  public DesktopLifecycle(ConfigurableApplicationContext context){this.context=context;}
  @EventListener(ApplicationReadyEvent.class)
  public void ready(){
    if(started.compareAndSet(false,true))
      Thread.ofPlatform().daemon().name("desktop-parent-monitor").start(()->watch(System.in,context::close));
  }
  static void watch(InputStream input,Runnable shutdown){
    try{
      var reader=new BufferedReader(new InputStreamReader(input,StandardCharsets.UTF_8));
      String line;
      while((line=reader.readLine())!=null)if("STOP".equals(line))break;
    }catch(IOException ignored){/* A lost parent pipe is also a shutdown request. */}
    shutdown.run();
  }
}
