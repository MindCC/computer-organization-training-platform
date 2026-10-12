import { useEffect, useRef, useState } from 'react';
import { CaretDown } from '@phosphor-icons/react';
import './platformNavigation.css';

export function PlatformNavigation({ groups, isActive, onNavigate }) {
  const [expanded, setExpanded] = useState(null);
  const nav = useRef(null);
  const activeGroup = groups.find(group => group.items.some(item => isActive(item.id)));
  const shown = expanded === false ? null : groups.find(group => group.id === expanded) ?? activeGroup;
  useEffect(() => setExpanded(null), [activeGroup?.id]);
  return <nav className="topbar-nav" aria-label="主导航" ref={nav} onKeyDown={event => {
    if (event.key === 'Escape' && shown?.items.length > 1) {
      event.stopPropagation(); setExpanded(false);
      nav.current?.querySelector(`[aria-controls="nav-menu-${shown.id}"]`)?.focus();
    }
  }}>
    <div className="topbar-nav-primary">{groups.map(group => {
      const nested = group.items.length > 1, Icon = group.items[0].icon;
      const open = nested && shown?.id === group.id;
      return <button key={group.id} type="button" className={`topbar-nav-item${nested?' topbar-nav-toggle':''}${activeGroup?.id===group.id?' active':''}${open?' expanded':''}`}
        aria-current={!nested && activeGroup?.id===group.id?'page':undefined}
        aria-controls={nested?`nav-menu-${group.id}`:undefined} aria-expanded={nested?open:undefined}
        onClick={() => { if(nested)setExpanded(open?false:group.id);else{setExpanded(null);onNavigate(group.items[0].id);} }}>
        <Icon size={18}/><span>{group.label}</span>{nested&&<CaretDown className="topbar-nav-caret" size={14}/>}</button>;
    })}</div>
    {groups.filter(group => group.items.length > 1).map(group => <div className="topbar-nav-secondary" key={group.id} id={`nav-menu-${group.id}`} hidden={shown?.id!==group.id} aria-label={`${group.label}子导航`}>
      <span className="topbar-secondary-label">{group.label}</span>
      {group.items.map(({id,label,icon:Icon}) => <button type="button" key={id} className={`topbar-nav-item${isActive(id)?' active':''}`} aria-current={isActive(id)?'page':undefined} onClick={()=>{setExpanded(null);onNavigate(id);}}><Icon size={17}/><span>{label}</span></button>)}
    </div>)}
  </nav>;
}
