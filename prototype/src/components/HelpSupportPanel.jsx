import { useMemo, useState } from 'react';
import { ArrowRight, MagnifyingGlass } from '@phosphor-icons/react';
import { filterHelpGuides } from '../helpGuides.js';

export function HelpSupportPanel({ user, changeView, navigateToChallenge, onOpenSettings }) {
  const [role, setRole] = useState(user?.role === 'teacher' ? 'teacher' : 'student');
  const [group, setGroup] = useState('all');
  const [query, setQuery] = useState('');
  const groups = useMemo(() => [...new Set(filterHelpGuides({ role }).map(item => item.group))], [role]);
  const guides = useMemo(() => filterHelpGuides({ role, group, query }), [role, group, query]);
  function navigate(action) {
    if (action.settings) onOpenSettings?.(action.section ?? 'account');
    else if (action.challengeId) navigateToChallenge(action.challengeId);
    else changeView(action.view);
  }
  return <div className="help-guide-workspace">
    <aside className="help-guide-nav" aria-label="帮助分类">
      <div className="help-role-tabs" role="tablist" aria-label="使用指南身份">{[{ id: 'student', title: '学生指南' }, { id: 'teacher', title: '教师指南' }].map(item => <button type="button" role="tab" key={item.id} aria-selected={role === item.id} onClick={() => { setRole(item.id); setGroup('all'); }}>{item.title}</button>)}</div>
      <label className="help-guide-search"><MagnifyingGlass size={16} /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索功能或操作" aria-label="搜索使用指南" /></label>
      <nav aria-label="功能分组">{['all', ...groups].map(item => <button type="button" key={item} aria-pressed={group === item} onClick={() => setGroup(item)}>{item === 'all' ? '全部功能' : item}<span>{filterHelpGuides({ role, group: item }).length}</span></button>)}</nav>
    </aside>
    <div className="help-guide-content">
      <header><strong>{role === 'teacher' ? '教师使用指南' : '学生使用指南'}</strong><span>{guides.length} 项逐步说明</span></header>
      <p className="help-guide-intro">先选功能分类，再点功能名称展开说明。请按数字顺序操作；每条说明末尾的按钮可直接打开对应页面。</p>
      {guides.length ? guides.map((item, index) => <details className="help-step-guide" data-help-guide={item.id} key={`${role}:${group}:${item.id}`} open={query.trim() ? true : undefined}>
        <summary><span className="help-guide-number">{String(index + 1).padStart(2, '0')}</span><div><strong>{item.title}</strong><small>{item.summary}</small></div></summary>
        <div className="help-step-body"><h3>照着做</h3><ol>{item.steps.map(step => <li key={step}>{step}</li>)}</ol>
        {(item.role === 'common' || item.role === user?.role || !user) && (!item.action.settings || (user && onOpenSettings)) ? <button type="button" className="ghost-button" onClick={() => navigate(item.action)}>{item.action.label}<ArrowRight size={15} /></button> : <p className="help-guide-role-note">{!user && item.action.settings ? '登录后可从账号菜单进入个人设置。' : `此操作使用${item.role === 'teacher' ? '教师' : '学生'}账号进入。`}</p>}</div>
      </details>) : <div className="support-empty"><h2>没有找到对应说明</h2><p>试试“作业”“连线”“密码”或清空搜索。</p><button type="button" className="ghost-button" onClick={() => { setQuery(''); setGroup('all'); }}>查看全部功能</button></div>}
    </div>
  </div>;
}
