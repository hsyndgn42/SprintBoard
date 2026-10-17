import type {TeamMember} from '../api.service';
export const activeMembers=(members:TeamMember[])=>members.filter(m=>Number(m.active)===1);
/** Presentation only: historical records stay intact and are never deleted. */
export function activeMemberRecords<T extends {memberId:string}>(records:T[],members:TeamMember[]):T[]{
 const ids=new Set(activeMembers(members).map(m=>m.id));return records.filter(r=>ids.has(r.memberId));
}
