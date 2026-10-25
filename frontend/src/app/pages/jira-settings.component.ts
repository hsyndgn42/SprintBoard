import {Component,ChangeDetectorRef,inject,OnInit,OnDestroy} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {ApiService} from '../api.service';

interface JiraStatus {baseUrl:string;projectKey:string;boardId:string;defectJql:string;fieldDefaults:string;enabled:boolean;version:number;patConfigured:boolean}
interface JiraTestResult {connected:boolean;user:string;account?:string;project?:string;projectReachable?:boolean;projectError?:string}

@Component({selector:'app-jira-settings',standalone:true,imports:[FormsModule],templateUrl:'./jira-settings.component.html',styleUrl:'./jira-settings.component.css'})
export class JiraSettingsComponent implements OnInit,OnDestroy {
 private api=inject(ApiService);private cdr=inject(ChangeDetectorRef);private destroyed=false;private version=0;
 status:JiraStatus|null=null;
 baseUrl='';projectKey='';boardId='';defectJql='';fieldDefaults='';enabled=false;pat='';
 busy=false;error='';message='';confirmForget=false;testResult:JiraTestResult|null=null;

 async ngOnInit(){await this.load();}
 ngOnDestroy(){this.destroyed=true;this.pat='';}
 private refresh(){if(!this.destroyed)this.cdr.detectChanges();}
 private apply(s:JiraStatus){this.status=s;this.baseUrl=s.baseUrl;this.projectKey=s.projectKey;this.boardId=s.boardId;this.defectJql=s.defectJql;this.fieldDefaults=s.fieldDefaults;this.enabled=s.enabled;this.version=s.version;}

 async load(){if(this.busy)return;try{this.apply(await this.api.get<JiraStatus>('/admin/jira'));}catch{this.error='Jira ayarları alınamadı.';}finally{this.refresh();}}

 async save(){
  const data={baseUrl:this.baseUrl,projectKey:this.projectKey,boardId:this.boardId,defectJql:this.defectJql,fieldDefaults:this.fieldDefaults,enabled:this.enabled,version:this.version,pat:this.pat};
  this.pat='';
  await this.run(()=>this.api.put<JiraStatus>('/admin/jira',data),'Jira ayarları kaydedildi.');
 }

 /** Reaching Jira costs two throttled calls, so the result is shown rather than polled. */
 async test(){
  if(this.busy)return;
  this.busy=true;this.error='';this.message='';this.testResult=null;this.refresh();
  try{
   const result=await this.api.post<JiraTestResult>('/admin/jira/test',{});
   this.testResult=result;
   this.message=result.projectReachable===false?'Jira bağlantısı kuruldu ama proje açılamadı.':'Jira bağlantısı doğrulandı.';
  }catch(e){this.error=String(e);}
  finally{this.busy=false;this.refresh();}
 }

 setForget(value:boolean){this.confirmForget=value;this.refresh();}
 async forget(){await this.run(()=>this.api.delete<JiraStatus>('/admin/jira/credentials'),'Jira tokenı silindi.');this.confirmForget=false;this.testResult=null;this.refresh();}

 private async run(fn:()=>Promise<JiraStatus>,message:string){
  if(this.busy)return;
  this.busy=true;this.error='';this.message='';this.refresh();
  try{this.apply(await fn());this.message=message;}
  catch(e){this.error=String(e);}
  finally{this.busy=false;this.refresh();}
 }
}
