import { useEffect, useRef } from 'react';

function routeUrl(route) {
  const url=new URL(window.location.href);
  if(route.view==='demo'&&route.demoId)url.searchParams.set('demo',route.demoId);else url.searchParams.delete('demo');
  return url;
}

// Browser navigation is scoped to the current identity; it never restores login state.
export function useViewHistory({route,user,enabled,restore}) {
  const current=useRef(null),previous=useRef(null),restoring=useRef(null);
  const owner=user?`${user.role}:${user.id}`:'guest';
  const signature=JSON.stringify({owner,...route});
  current.current={route,owner,restore,signature};
  useEffect(()=>{
    if(!enabled)return;
    const entry={...window.history.state,zcylRoute:{owner,...route}};
    const url=routeUrl(route);
    if(restoring.current===signature){restoring.current=null;previous.current={owner,signature};return;}
    if(previous.current?.signature===signature)return;
    if(!previous.current||previous.current.owner!==owner)window.history.replaceState(entry,'',url);
    else window.history.pushState(entry,'',url);
    previous.current={owner,signature};
  },[signature,enabled]);
  useEffect(()=>{
    const onPop=event=>{
      const target=event.state?.zcylRoute,active=current.current;
      if(!target||!active)return;
      if(target.owner!==active.owner){window.history.replaceState({...event.state,zcylRoute:{owner:active.owner,...active.route}},'',routeUrl(active.route));return;}
      const {owner:targetOwner,...next}=target;
      const nextSignature=JSON.stringify({owner:targetOwner,...next});
      if(nextSignature===active.signature)return;
      restoring.current=nextSignature;
      if(active.restore(next)===false){restoring.current=null;window.history.replaceState({...event.state,zcylRoute:{owner:active.owner,...active.route}},'',routeUrl(active.route));}
    };
    window.addEventListener('popstate',onPop);return()=>window.removeEventListener('popstate',onPop);
  },[]);
}
