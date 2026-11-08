package com.sprintboard;

import static org.junit.jupiter.api.Assertions.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class DesktopLifecycleTest {
  @Test void stopCommandClosesContextExactlyOnce(){
    var calls=new AtomicInteger();
    DesktopLifecycle.watch(new ByteArrayInputStream("ignored\nSTOP\nSTOP\n".getBytes(StandardCharsets.UTF_8)),calls::incrementAndGet);
    assertEquals(1,calls.get());
  }
  @Test void parentExitOrPipeFailureAlsoClosesContext(){
    var calls=new AtomicInteger();
    DesktopLifecycle.watch(InputStream.nullInputStream(),calls::incrementAndGet);
    DesktopLifecycle.watch(new InputStream(){public int read()throws IOException{throw new IOException("closed");}},calls::incrementAndGet);
    assertEquals(2,calls.get());
  }
}
