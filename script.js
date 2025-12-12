/* Advanced Task Manager JS (split file) */
const STORAGE_KEY = 'advanced_tasks_v1';
let tasks = []; // {id, title, desc, due (yyyy-mm-dd|null), priority, tags:[], done, created}
let filter = 'all';
let sortBy = 'created-desc';
let searchQ = '';
let undoStack = null;
let notificationsEnabled = false;

// Utilities
const el = id => document.getElementById(id);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,6);
const todayISO = () => (new Date()).toISOString().slice(0,10);
const parseDate = d => d ? new Date(d + 'T00:00:00') : null;
const isToday = d => {
  if(!d) return false;
  const a = new Date(d+'T00:00:00'), b = new Date();
  return a.toDateString() === new Date(b.getFullYear(),b.getMonth(),b.getDate()).toDateString();
};
const isOverdue = d => {
  if(!d) return false;
  const a = new Date(d+'T00:00:00');
  const today = new Date(); today.setHours(0,0,0,0);
  return a < today;
};
const priorityRank = p => ({high:3, medium:2, low:1}[p]||2);

// Storage
function load(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    tasks = raw ? JSON.parse(raw) : [];
  }catch(e){ tasks = []; }
  updateStats();
}
function save(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  updateStats();
}

// UI helpers
function showToast(msg, time=2500){
  const t = el('toast'); t.innerText = msg; t.style.display='block';
  clearTimeout(t._t); t._t = setTimeout(()=> t.style.display='none', time);
}

function updateStats(){
  el('stats').innerText = `${tasks.length} tasks`;
}

// Add Task
el('addBtn').addEventListener('click', addTaskFromForm);
el('addForm').addEventListener('submit', addTaskFromForm);

function addTaskFromForm(e){
  e?.preventDefault?.();
  const title = el('taskTitle').value.trim();
  if(!title) return el('taskTitle').focus();
  const due = el('taskDue').value || null;
  const priority = el('taskPriority').value || 'medium';
  const tags = el('taskTags').value.split(',').map(s=>s.trim()).filter(Boolean);
  const newTask = {
    id: uid(), title, desc:'', due, priority, tags, done:false, created: new Date().toISOString()
  };
  tasks.unshift(newTask);
  save();
  render();
  el('taskTitle').value=''; el('taskDue').value=''; el('taskTags').value=''; el('taskPriority').value='medium';
  showToast('Task added');
  scheduleDueNotification(newTask);
}

// Render tasks
function getFilteredSortedTasks(){
  let out = tasks.slice();
  // search
  if(searchQ){
    const q = searchQ.toLowerCase();
    out = out.filter(t => (t.title + ' ' + (t.desc||'') + ' ' + (t.tags||[]).join(' ')).toLowerCase().includes(q));
  }
  // filter
  if(filter === 'active') out = out.filter(t => !t.done);
  if(filter === 'completed') out = out.filter(t => t.done);
  if(filter === 'today') out = out.filter(t => isToday(t.due) && !t.done);
  if(filter === 'overdue') out = out.filter(t => isOverdue(t.due) && !t.done);
  // sort
  if(sortBy === 'created-desc') out.sort((a,b)=> new Date(b.created)-new Date(a.created));
  if(sortBy === 'created-asc') out.sort((a,b)=> new Date(a.created)-new Date(b.created));
  if(sortBy === 'due-asc') out.sort((a,b)=>{
    if(!a.due) return 1; if(!b.due) return -1;
    return new Date(a.due) - new Date(b.due);
  });
  if(sortBy === 'due-desc') out.sort((a,b)=>{
    if(!a.due) return 1; if(!b.due) return -1;
    return new Date(b.due) - new Date(a.due);
  });
  if(sortBy === 'priority-desc') out.sort((a,b)=> priorityRank(b.priority) - priorityRank(a.priority));
  return out;
}

function render(){
  const list = el('taskList'); list.innerHTML='';
  const visible = getFilteredSortedTasks();
  if(visible.length === 0) el('empty').style.display='block'; else el('empty').style.display='none';
  el('visibleCount').innerText = visible.length;
  visible.forEach((t, idx) => {
    const item = document.createElement('div');
    item.className = 'task';
    item.draggable = true;
    item.dataset.id = t.id;

    // checkbox
    const chk = document.createElement('div');
    chk.className = 'checkbox' + (t.done ? ' checked' : '');
    chk.innerHTML = t.done ? '✓' : '';
    chk.title = 'Mark complete';
    chk.addEventListener('click', ()=> toggleDone(t.id));
    item.appendChild(chk);

    // info
    const info = document.createElement('div');
    info.className = 'task-info';

    const title = document.createElement('div');
    title.className = 'title';
    const titleText = document.createElement('div');
    titleText.className = 'nowrap';
    titleText.innerText = t.title;
    titleText.tabIndex = 0;
    titleText.style.cursor = 'pointer';
    // edit on click
    titleText.addEventListener('click', ()=> openEditModal(t.id));
    titleText.addEventListener('keydown', (e)=>{ if(e.key==='Enter') openEditModal(t.id); });
    title.appendChild(titleText);

    const createdMeta = document.createElement('div');
    createdMeta.className='meta';
    createdMeta.style.marginLeft='6px'; createdMeta.innerText = ` • ${new Date(t.created).toLocaleDateString()}`;
    title.appendChild(createdMeta);

    info.appendChild(title);

    if(t.desc){
      const desc = document.createElement('div'); desc.className='desc'; desc.innerText = t.desc; info.appendChild(desc);
    }

    // meta row
    const meta = document.createElement('div'); meta.className='meta-row';
    if(t.due){
      const dueBadge = document.createElement('div');
      dueBadge.className = 'badge ' + (isOverdue(t.due)?'overdue':'');
      dueBadge.innerText = 'Due: ' + t.due + (isToday(t.due) ? ' • today' : '');
      meta.appendChild(dueBadge);
    }
    const pBadge = document.createElement('div');
    pBadge.className = 'badge ' + (t.priority==='high'?'priority-high': t.priority==='low'?'priority-low':'priority-med');
    pBadge.innerText = t.priority.charAt(0).toUpperCase() + t.priority.slice(1);
    meta.appendChild(pBadge);

    if(t.tags && t.tags.length){
      t.tags.slice(0,4).forEach(tag=>{
        const tg = document.createElement('div'); tg.className='badge'; tg.innerText = tag; meta.appendChild(tg);
      });
    }

    info.appendChild(meta);
    item.appendChild(info);

    // actions
    const actions = document.createElement('div'); actions.className='task-actions';
    const editBtn = document.createElement('button'); editBtn.className='icon-btn'; editBtn.title='Edit'; editBtn.innerText='✎';
    editBtn.addEventListener('click', ()=> openEditModal(t.id));
    const delBtn = document.createElement('button'); delBtn.className='icon-btn'; delBtn.title='Delete'; delBtn.innerText='🗑';
    delBtn.addEventListener('click', ()=> deleteTask(t.id));
    actions.appendChild(editBtn); actions.appendChild(delBtn);
    item.appendChild(actions);

    // drag events
    item.addEventListener('dragstart', (ev)=> {
      ev.dataTransfer.setData('text/plain', t.id);
      item.classList.add('dragging');
    });
    item.addEventListener('dragend', ()=> item.classList.remove('dragging'));

    // allow drop between items
    item.addEventListener('dragover', (ev)=> {
      ev.preventDefault();
      const dragging = document.querySelector('.task.dragging');
      if(!dragging || dragging === item) return;
      const rect = item.getBoundingClientRect();
      const mid = rect.top + rect.height/2;
      const listParent = list;
      if(ev.clientY < mid){
        listParent.insertBefore(dragging, item);
      } else {
        listParent.insertBefore(dragging, item.nextSibling);
      }
    });

    list.appendChild(item);
  });

  // after DOM order change, persist positions when user stops dragging
  // We'll listen globally for drop
  document.addEventListener('drop', onDropPersist, {once:true});
}

function onDropPersist(e){
  // Rebuild tasks according to DOM order for visible (filtered+sorted) list only.
  const visibleNodes = Array.from(el('taskList').children);
  const orderedIds = visibleNodes.map(n=>n.dataset.id);
  const ordered = orderedIds.map(id => tasks.find(t => t.id === id)).filter(Boolean);
  const remaining = tasks.filter(t => !orderedIds.includes(t.id));
  tasks = ordered.concat(remaining);
  save();
  render();
  showToast('Order updated');
}

// Toggle done
function toggleDone(id){
  const t = tasks.find(x=>x.id===id); if(!t) return;
  t.done = !t.done; save(); render();
}

// Delete
function deleteTask(id){
  const idx = tasks.findIndex(t=>t.id===id);
  if(idx === -1) return;
  undoStack = {task: tasks[idx], index: idx};
  tasks.splice(idx,1); save(); render();
  showToast('Task deleted — Undo?', 4000);
  el('toast').onclick = () => {
    if(undoStack){ tasks.splice(undoStack.index,0,undoStack.task); save(); render(); undoStack=null; showToast('Restored'); }
  };
}

// Clear All
el('clear-all').addEventListener('click', ()=>{
  if(!confirm('Clear all tasks?')) return;
  tasks = []; save(); render(); showToast('All cleared');
});

// Edit modal
let editingId = null;
function openEditModal(id){
  const t = tasks.find(x=>x.id===id); if(!t) return;
  editingId = id;
  el('editTitle').value = t.title;
  el('editDesc').value = t.desc || '';
  el('editDue').value = t.due || '';
  el('editPriority').value = t.priority || 'medium';
  el('editTags').value = (t.tags || []).join(', ');
  el('modal').style.display = 'block';
}
el('cancelEdit').addEventListener('click', ()=> { el('modal').style.display='none'; editingId=null; });
el('modalBack').addEventListener('click', (e)=> { if(e.target===el('modalBack')) { el('modal').style.display='none'; editingId=null; }});
el('saveEdit').addEventListener('click', ()=>{
  if(!editingId) return;
  const t = tasks.find(x=>x.id===editingId); if(!t) return;
  t.title = el('editTitle').value.trim() || t.title;
  t.desc = el('editDesc').value.trim();
  t.due = el('editDue').value || null;
  t.priority = el('editPriority').value || 'medium';
  t.tags = el('editTags').value.split(',').map(s=>s.trim()).filter(Boolean);
  save(); render(); el('modal').style.display='none'; editingId=null;
  showToast('Task updated');
});

// Search and filters
el('search').addEventListener('input', (e)=>{ searchQ = e.target.value; render(); });
Array.from(document.querySelectorAll('#filterList .chip')).forEach(chip=>{
  chip.addEventListener('click', ()=>{
    Array.from(document.querySelectorAll('#filterList .chip')).forEach(c=>c.classList.remove('active'));
    chip.classList.add('active');
    filter = chip.dataset.filter;
    render();
  });
});
el('sortBy').addEventListener('change', (e)=> { sortBy = e.target.value; render(); });

// Keyboard quick-add: Enter in Title adds
el('taskTitle').addEventListener('keydown', (e)=> { if(e.key==='Enter'){ addTaskFromForm(e); } });

// Notifications (optional)
el('notify-btn').addEventListener('click', async ()=>{
  if(!("Notification" in window)){ alert('Notifications not supported in this browser'); return; }
  if(Notification.permission === 'granted'){ notificationsEnabled = true; showToast('Notifications already enabled'); }
  else {
    const res = await Notification.requestPermission();
    notificationsEnabled = (res === 'granted');
    showToast(notificationsEnabled ? 'Notifications enabled' : 'Notifications blocked');
  }
});

// schedule simple due notification when adding a task
function scheduleDueNotification(task){
  if(!notificationsEnabled) return;
  if(!task.due) return;
  if(isToday(task.due) && !task.done){
    try{ new Notification('Task due today', {body: task.title}); }
    catch(e){ /* ignore */ }
  }
}

// Run a check on load to notify on tasks due today (best-effort)
function checkDueOnLoad(){
  if(!notificationsEnabled || Notification.permission!=='granted') return;
  tasks.forEach(t => { if(!t.done && t.due && isToday(t.due)) {
    try{ new Notification('Due today: ' + t.title); }catch(e){}
  }});
}

// Initialize app
function init(){
  load();
  render();
  el('taskTitle').focus();
  notificationsEnabled = (Notification && Notification.permission === 'granted');
  checkDueOnLoad();
}
init();

/* Accessibility: keyboard shortcuts (optional)
  - N : focus new task title
  - / : focus search
*/
document.addEventListener('keydown', (e)=>{
  if(e.key === 'n' && !e.ctrlKey && !e.metaKey){ el('taskTitle').focus(); }
  if(e.key === '/' && document.activeElement !== el('search')){ e.preventDefault(); el('search').focus(); }
});
