package com.sprintboard.desktop;

import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.*;
import java.net.*;
import java.nio.channels.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import javax.swing.*;

/** A Java-only desktop launcher, built separately from the server and bundled by jpackage. */
public final class SprintBoardLauncher {
  private final Path appDir,dataDir;
  private final boolean headless,noBrowser,stopOnly;
  private final Integer portOverride;
  private final AtomicBoolean stopRequested=new AtomicBoolean(),stopping=new AtomicBoolean();
  private final String instance=UUID.randomUUID().toString();
  private Process child;
  private URI address;
  private DesktopSettings settings;
  private TrayIcon tray;
  private JFrame frame;

  private SprintBoardLauncher(String[] args)throws Exception{
    appDir=Path.of(SprintBoardLauncher.class.getProtectionDomain().getCodeSource().getLocation().toURI()).toAbsolutePath().getParent();
    Map<String,String> flags=new HashMap<>();
    for(String arg:args){int eq=arg.indexOf('=');String key=eq<0?arg:arg.substring(0,eq);if(!Set.of("--data-dir","--port","--headless","--no-browser","--stop").contains(key))throw new IllegalArgumentException("Bilinmeyen başlatma seçeneği.");flags.put(key,eq<0?"true":arg.substring(eq+1));}
    headless=flags.containsKey("--headless");noBrowser=headless||flags.containsKey("--no-browser");stopOnly=flags.containsKey("--stop");
    String local=System.getenv("LOCALAPPDATA");
    if(!flags.containsKey("--data-dir")&&(local==null||local.isBlank()))throw new IllegalArgumentException("Windows kullanıcı veri klasörü bulunamadı.");
    dataDir=Path.of(flags.getOrDefault("--data-dir",Objects.toString(local,"")+"/SprintBoardData")).toAbsolutePath().normalize();
    if(dataDir.startsWith(appDir.getParent())||dataDir.toString().contains(";")||dataDir.toString().startsWith("\\\\"))throw new IllegalArgumentException("Veri klasörü uygulama kurulumundan ayrı bir yerel klasör olmalı.");
    portOverride=flags.containsKey("--port")?DesktopSettings.port(flags.get("--port")):null;
  }

  public static void main(String[] args){
    int result=0;
    try{new SprintBoardLauncher(args).run();}
    catch(Exception e){result=1;String message=Objects.toString(e.getMessage(),"Başlatma tamamlanamadı.");System.err.println(message);
      if(!Arrays.asList(args).contains("--headless"))JOptionPane.showMessageDialog(null,message,"SprintBoard",JOptionPane.ERROR_MESSAGE);}
    System.exit(result);
  }

  private void run()throws Exception{
    Files.createDirectories(dataDir);
    try(var channel=FileChannel.open(dataDir.resolve("launcher.lock"),StandardOpenOption.CREATE,StandardOpenOption.WRITE)){
      FileLock lock=channel.tryLock();
      if(lock==null){existing();return;}
      try(lock){
        if(stopOnly)return;
        Path database=dataDir.resolve("service/data/sprintboard.mv.db");
        if(Files.exists(dataDir.resolve("initialized"))&&!Files.isRegularFile(database))throw new IOException("Mevcut veritabanı bulunamadı. Boş veriyle açılmadı. Yedeğinizi bu klasöre geri yükleyin: "+dataDir);
        settings=DesktopSettings.load(dataDir,portOverride);int serverPort=settings.port;
        String bind=settings.bind;address=settings.address;
        try(var probe=new java.net.ServerSocket()){probe.setReuseAddress(false);probe.bind(new InetSocketAddress(bind,serverPort));}
        catch(IOException e){throw new IOException(serverPort+" portu kullanımda. Diğer uygulamayı kapatın veya "+dataDir.resolve("settings.properties")+" dosyasında server.port değerini değiştirin.");}
        Files.createDirectories(dataDir.resolve("logs"));Files.createDirectories(database.getParent());
        Path service=appDir.resolve("sprintboard-service.jar"),java=Path.of(System.getProperty("java.home"),"bin","javaw.exe");
        if(!Files.isRegularFile(service)||!Files.isRegularFile(java))throw new IOException("Kurulum eksik. SprintBoard kurulum paketini yeniden çalıştırın.");
        rotateLog();
        var command=new ArrayList<>(List.of(java.toString(),"-Duser.timezone=Europe/Istanbul","-Dfile.encoding=UTF-8","-jar",service.toString(),
          "--spring.config.location=classpath:/application.properties",
          "--spring.datasource.url=jdbc:h2:file:"+dataDir.resolve("service/data/sprintboard").toString().replace('\\','/')+";DB_CLOSE_ON_EXIT=FALSE;WRITE_DELAY=0"+(Files.exists(database)?";IFEXISTS=TRUE":""),
          "--sprintboard.desktop.managed=true"));
        command.addAll(settings.serverArguments);
        var builder=new ProcessBuilder(command).directory(dataDir.toFile()).redirectErrorStream(true).redirectOutput(ProcessBuilder.Redirect.appendTo(dataDir.resolve("logs/service.log").toFile()));
        // A workstation's old deployment variables must not select another DB or inject its tokens.
        builder.environment().keySet().removeIf(key->{String upper=key.toUpperCase(Locale.ROOT);return upper.startsWith("SPRINTBOARD_")||upper.startsWith("SPRING_")||upper.startsWith("SERVER_")||upper.startsWith("MANAGEMENT_")||upper.startsWith("LOGGING_")||Set.of("JAVA_TOOL_OPTIONS","JDK_JAVA_OPTIONS","_JAVA_OPTIONS","CLASSPATH").contains(upper);});
        builder.environment().putAll(settings.serverEnvironment);
        child=builder.start();
        Runtime.getRuntime().addShutdownHook(new Thread(this::stopChild,"desktop-shutdown"));
        writeState(serverPort);
        try{
          awaitReady();
          Files.writeString(dataDir.resolve("initialized"),"SprintBoard data directory\n",StandardOpenOption.CREATE,StandardOpenOption.TRUNCATE_EXISTING);
          if(!headless)installControls();
          if(!noBrowser)openBrowser();
          while(child.isAlive()&&!stopRequested.get()){
            Path request=dataDir.resolve("stop.request");
            if(Files.isRegularFile(request)&&Files.readString(request).trim().equals(instance))stopRequested.set(true);
            Thread.sleep(250);
          }
          if(!stopRequested.get()&&child.exitValue()!=0)throw new IOException("Servis durdu. Günlük dosyasını kontrol edin: "+dataDir.resolve("logs/service.log"));
        }finally{
          stopChild();Files.deleteIfExists(dataDir.resolve("launcher.properties"));Files.deleteIfExists(dataDir.resolve("stop.request"));
          if(!headless)EventQueue.invokeAndWait(()->{if(tray!=null)SystemTray.getSystemTray().remove(tray);if(frame!=null)frame.dispose();});
        }
      }
    }
  }

  private void writeState(int serverPort)throws IOException{
    var values=new Properties();values.setProperty("port",Integer.toString(serverPort));values.setProperty("instance",instance);values.setProperty("pid",Long.toString(ProcessHandle.current().pid()));
    values.setProperty("address",address.toString());
    try(var output=Files.newBufferedWriter(dataDir.resolve("launcher.properties"),StandardCharsets.UTF_8)){values.store(output,"Local launcher state - no credentials");}
  }
  private void existing()throws Exception{
    for(int i=0;i<90;i++){
      var values=new Properties();Path file=dataDir.resolve("launcher.properties");
      if(Files.isRegularFile(file))try(var input=Files.newBufferedReader(file,StandardCharsets.UTF_8)){values.load(input);}
      if(values.containsKey("port")&&values.containsKey("instance")){
        if(stopOnly){Files.writeString(dataDir.resolve("stop.request"),values.getProperty("instance"),StandardOpenOption.CREATE,StandardOpenOption.TRUNCATE_EXISTING);return;}
        settings=DesktopSettings.load(dataDir,DesktopSettings.port(values.getProperty("port")));address=settings.address;
        if(healthy()){if(!noBrowser)openBrowser();return;}
      }
      Thread.sleep(500);
    }
    throw new IOException("SprintBoard zaten başlatılıyor veya kapanıyor. Birkaç saniye sonra tekrar deneyin.");
  }
  private boolean healthy(){
    return settings!=null&&settings.healthy();
  }
  private void awaitReady()throws Exception{
    for(int i=0;i<120;i++){if(!child.isAlive())break;if(healthy())return;Thread.sleep(500);}
    throw new IOException("SprintBoard açılamadı. Günlük dosyası: "+dataDir.resolve("logs/service.log"));
  }
  private void stopChild(){
    if(child==null||!stopping.compareAndSet(false,true))return;
    try{
      if(child.isAlive()){child.getOutputStream().write("STOP\n".getBytes(StandardCharsets.UTF_8));child.getOutputStream().flush();if(!child.waitFor(25,TimeUnit.SECONDS)){child.destroy();child.waitFor(5,TimeUnit.SECONDS);}}
    }catch(Exception ignored){if(child.isAlive())child.destroy();}
  }
  private void rotateLog()throws IOException{
    Path current=dataDir.resolve("logs/service.log");
    if(Files.isRegularFile(current)&&Files.size(current)>5_000_000)Files.move(current,dataDir.resolve("logs/service.previous.log"),StandardCopyOption.REPLACE_EXISTING);
  }
  private void openBrowser(){try{Desktop.getDesktop().browse(address);}catch(Exception e){if(!headless)JOptionPane.showMessageDialog(null,"Tarayıcıda açın: "+address,"SprintBoard",JOptionPane.INFORMATION_MESSAGE);}}
  private void openFolder(){try{Desktop.getDesktop().open(dataDir.toFile());}catch(IOException ignored){}}
  private static BufferedImage icon(){
    var image=new BufferedImage(64,64,BufferedImage.TYPE_INT_ARGB);var g=image.createGraphics();g.setRenderingHint(RenderingHints.KEY_ANTIALIASING,RenderingHints.VALUE_ANTIALIAS_ON);g.setColor(new Color(0x1565c0));g.fillRoundRect(0,0,64,64,18,18);g.setColor(Color.WHITE);g.setFont(new Font("SansSerif",Font.BOLD,46));g.drawString("S",17,49);g.dispose();return image;
  }
  private void installControls()throws Exception{
    EventQueue.invokeAndWait(()->{
      if(SystemTray.isSupported())try{
        var menu=new PopupMenu();var open=new MenuItem("SprintBoard'u aç");open.addActionListener(e->openBrowser());menu.add(open);
        var data=new MenuItem("Veri ve ayar klasörü");data.addActionListener(e->openFolder());menu.add(data);menu.addSeparator();
        var quit=new MenuItem("Servisi durdur ve çık");quit.addActionListener(e->stopRequested.set(true));menu.add(quit);
        tray=new TrayIcon(icon(),"SprintBoard · "+address,menu);tray.setImageAutoSize(true);tray.addActionListener(e->openBrowser());SystemTray.getSystemTray().add(tray);return;
      }catch(AWTException ignored){}
      frame=new JFrame("SprintBoard");frame.setIconImage(icon());frame.setDefaultCloseOperation(WindowConstants.DO_NOTHING_ON_CLOSE);
      frame.addWindowListener(new java.awt.event.WindowAdapter(){public void windowClosing(java.awt.event.WindowEvent e){stopRequested.set(true);}});
      var panel=new JPanel(new GridLayout(0,1,8,8));panel.setBorder(BorderFactory.createEmptyBorder(20,20,20,20));panel.add(new JLabel("SprintBoard çalışıyor: "+address));
      var open=new JButton("Tarayıcıda aç");open.addActionListener(e->openBrowser());panel.add(open);var data=new JButton("Veri ve ayar klasörü");data.addActionListener(e->openFolder());panel.add(data);
      var quit=new JButton("Servisi durdur ve çık");quit.addActionListener(e->stopRequested.set(true));panel.add(quit);frame.add(panel);frame.pack();frame.setLocationRelativeTo(null);frame.setVisible(true);
    });
  }
}
