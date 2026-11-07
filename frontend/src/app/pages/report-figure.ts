/**
 * Chart primitives shared by the report figures.
 *
 * A figure is geometry plus words: the same mark list is walked by an Angular template and by a
 * string renderer, so both stay trivial and the screen and the offline export cannot drift apart.
 */

/** One flat shape rather than a union, because neither renderer needs narrowing. */
export interface Mark{
 kind:'rect'|'path'|'line'|'text';
 x?:number;y?:number;w?:number;h?:number;rx?:number;fill?:string;
 d?:string;x1?:number;y1?:number;x2?:number;y2?:number;stroke?:string;strokeWidth?:number;
 text?:string;role?:'axis'|'zero'|'link'|'label'|'value'|'unit'|'inverse';anchor?:'start'|'middle'|'end';
}

export interface Figure{id:string;width:number;height:number;title:string;desc:string;marks:Mark[];empty?:string}

export const rect=(x:number,y:number,w:number,h:number,fill:string,rx=1):Mark=>({kind:'rect',x,y,w:Math.max(0,w),h:Math.max(0,h),fill,rx});
export const text=(x:number,y:number,value:string,role:'label'|'value'|'unit'|'inverse'='label',anchor:'start'|'middle'|'end'='start'):Mark=>({kind:'text',x,y,text:value,role,anchor});
export const line=(x1:number,y1:number,x2:number,y2:number,role:'axis'|'zero'|'link'='axis'):Mark=>({kind:'line',x1,y1,x2,y2,role});
export const path=(d:string,fill:string):Mark=>({kind:'path',d,fill});
/** A stroked line through points, used where a trend must read as one continuous movement. */
export const polyline=(points:[number,number][],stroke:string,strokeWidth=2.5):Mark=>
 ({kind:'path',d:points.map(([x,y],i)=>(i?'L':'M')+x+' '+y).join(' '),fill:'none',stroke,strokeWidth});
export const clip=(value:string,max=26)=>value.length>max?value.slice(0,max-1)+'…':value;
