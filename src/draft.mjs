// The code is embedded verbatim to avoid build-tool helpers leaking into browser scripts.
export const draftRecoverySource = `function createDraftRecovery({read,write,storage,report,setTimer=setTimeout,clearTimer=clearTimeout}) {
  const key='zxcxblog-local-draft-v1'; let enabled=false, timer;
  function cancel(){if(timer!==undefined)clearTimer(timer);timer=undefined;}
  function hasBackup(){try{return storage.getItem(key)!==null}catch{return false}}
  function save(){cancel();if(!enabled)return;try{storage.setItem(key,JSON.stringify({version:1,fields:read()}));report('已保存本标签页的本地备份');}catch{report('浏览器本地备份不可用，请手动保存草稿');}}
  function changed(){cancel();if(enabled)timer=setTimer(save,1200);}
  function setEnabled(value){enabled=Boolean(value);cancel();if(enabled)changed();else report('本地备份已关闭');}
  function restore(){cancel();try{const data=JSON.parse(storage.getItem(key));if(!data || data.version!==1 || !data.fields || typeof data.fields!=='object')throw Error('备份无效');write(data.fields);report('已恢复本地备份，请检查内容后保存');return true;}catch{report('没有可用的本地备份');return false;}}
  function clear(){cancel();try{storage.removeItem(key);report('本地备份已清除');}catch{report('无法清除本地备份');}}
  return {changed,setEnabled,restore,clear,hasBackup,flush:save};
}`;
