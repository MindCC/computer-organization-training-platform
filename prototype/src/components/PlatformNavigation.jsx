import { Fragment, useEffect, useRef, useState } from 'react';
import { CaretDown } from '@phosphor-icons/react';
import './platformNavigation.css';

const CLOSE_DELAY_MS = 220;
const MENU_GAP = 6;
const MENU_WIDTH = 212;

/**
 * 主导航：一级按钮 + 悬停展开的下拉列表（2026-10-14 用户要求，取代点击展开第二行的方案）。
 * - 鼠标移入分组即展开，移出延迟关闭（留出移入列表的时间）；
 * - 点击为「钉住」：触屏和无鼠标场景点一下保持展开，再点收起；
 * - Escape / 点击外部 / 页面滚动 / 跳转后关闭，Escape 关闭后焦点回到分组按钮。
 * 下拉列表用 position:fixed 按按钮位置计算坐标，保持一级按钮仍是 .topbar-nav-primary 的直接子元素。
 */
export function PlatformNavigation({ groups, isActive, onNavigate }) {
  const [expanded, setExpanded] = useState(null); // 展开的组 id；false 表示显式收起
  const [pinned, setPinned] = useState(false);
  const [menuPos, setMenuPos] = useState({ left: 0, top: 0 });
  const nav = useRef(null);
  const closeTimer = useRef(null);
  const activeGroup = groups.find(group => group.items.some(item => isActive(item.id)));
  const shown = expanded && expanded !== false ? groups.find(group => group.id === expanded) : null;

  useEffect(() => { setExpanded(null); setPinned(false); }, [activeGroup?.id]);
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  // 点击导航外部、页面滚动或缩放时收起（钉住的也同样收起）。
  useEffect(() => {
    if (!shown) return undefined;
    const onPointerDown = (event) => {
      if (nav.current && !nav.current.contains(event.target)) { setExpanded(false); setPinned(false); }
    };
    const onScrollOrResize = () => { setExpanded(false); setPinned(false); };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [shown]);

  function cancelClose() { clearTimeout(closeTimer.current); }
  function scheduleClose() {
    if (pinned) return;
    cancelClose();
    closeTimer.current = setTimeout(() => setExpanded(false), CLOSE_DELAY_MS);
  }
  function open(group, { pin = false } = {}) {
    cancelClose();
    setExpanded(group.id);
    setPinned(pin);
    const button = nav.current?.querySelector(`[aria-controls="nav-menu-${group.id}"]`);
    if (button) {
      const rect = button.getBoundingClientRect();
      const left = Math.max(4, Math.min(rect.left, window.innerWidth - MENU_WIDTH - 4));
      setMenuPos({ left, top: rect.bottom + MENU_GAP });
    }
  }
  function close() { cancelClose(); setExpanded(false); setPinned(false); }

  return <nav className="topbar-nav" aria-label="主导航" ref={nav} onKeyDown={event => {
    if (event.key === 'Escape' && shown) {
      event.stopPropagation();
      const id = shown.id;
      close();
      nav.current?.querySelector(`[aria-controls="nav-menu-${id}"]`)?.focus();
    }
  }}>
    <div className="topbar-nav-primary">{groups.map(group => {
      const nested = group.items.length > 1, Icon = group.items[0].icon;
      const isOpen = nested && shown?.id === group.id;
      if (!nested) {
        return <button key={group.id} type="button" className={`topbar-nav-item${activeGroup?.id===group.id?' active':''}`}
          aria-current={activeGroup?.id===group.id?'page':undefined}
          onClick={() => { close(); onNavigate(group.items[0].id); }}>
          <Icon size={18}/><span>{group.label}</span></button>;
      }
      return <Fragment key={group.id}>
        <button type="button" className={`topbar-nav-item topbar-nav-toggle${activeGroup?.id===group.id?' active':''}${isOpen?' expanded':''}`}
          aria-controls={`nav-menu-${group.id}`} aria-expanded={isOpen}
          onMouseEnter={() => open(group)} onMouseLeave={scheduleClose}
          onClick={() => { if (isOpen && pinned) close(); else open(group, { pin: true }); }}>
          <Icon size={18}/><span>{group.label}</span><CaretDown className="topbar-nav-caret" size={14}/></button>
        <div className="topbar-nav-secondary" id={`nav-menu-${group.id}`} hidden={!isOpen} aria-label={`${group.label}子导航`}
          style={isOpen ? { left: menuPos.left, top: menuPos.top } : undefined}
          onMouseEnter={cancelClose} onMouseLeave={scheduleClose}>
          <span className="topbar-secondary-label">{group.label}</span>
          {group.items.map(({id,label,icon:ItemIcon}) => <button type="button" key={id} className={`topbar-nav-item${isActive(id)?' active':''}`} aria-current={isActive(id)?'page':undefined} onClick={()=>{close();onNavigate(id);}}><ItemIcon size={17}/><span>{label}</span></button>)}
        </div>
      </Fragment>;
    })}</div>
  </nav>;
}
