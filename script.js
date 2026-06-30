(function() {
  'use strict';

  const editor = document.getElementById('codeEditor');
  const pathText = document.getElementById('pathText');
  const explorerTree = document.getElementById('explorerTree');
  const explorerOverlay = document.getElementById('explorerOverlay');
  const explorerBackdrop = document.getElementById('explorerBackdrop');
  const outputOverlay = document.getElementById('outputOverlay');
  const outputFrame = document.getElementById('outputFrame');
  const miniDropdown = document.getElementById('miniDropdown');
  const modalOverlay = document.getElementById('modalOverlay');
  const modalInput = document.getElementById('modalInput');
  const modalLabel = document.getElementById('modalLabel');
  const contextMenu = document.getElementById('contextMenu');
  const searchInput = document.getElementById('searchInput');
  const searchDropdownBar = document.getElementById('searchDropdownBar');
  const searchToggleBtn = document.getElementById('searchToggleBtn');
  const explorerMoreBtn = document.getElementById('explorerMoreBtn');
  const explorerMoreDropdown = document.getElementById('explorerMoreDropdown');

  const STORAGE_KEY = 'fcet_fs_v10';
  let fileSystem = { root: { type: 'folder', children: {} } };
  let currentFilePath = null;
  let selectedTreePath = null;
  let contextTargetPath = null;
  let contextTargetType = null;
  let clipboardPath = null;
  let clipboardAction = null;
  let modalMode = 'file';
  let modalParentPath = 'root';

  function showToast(msg) {
    let toast = document.querySelector('.toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(function() {
      toast.classList.remove('show');
    }, 2000);
  }

  function initFS() {
    fileSystem = { root: { type: 'folder', children: {} } };
  }

  function loadFS() {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      if (s) {
        const parsed = JSON.parse(s);
        if (parsed && parsed.root && parsed.root.type === 'folder') {
          fileSystem = parsed;
          if (!fileSystem.root.children) {
            fileSystem.root.children = {};
          }
        } else {
          initFS();
        }
      } else {
        initFS();
      }
    } catch(e) {
      initFS();
    }
  }

  function saveFS() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fileSystem));
    } catch(e) {
      console.error('Save failed:', e);
      showToast('Storage full. Please free up space.');
    }
  }

  function ensureChildren(node) {
    if (node && node.type === 'folder' && !node.children) {
      node.children = {};
    }
  }

  function getNode(path) {
    if (!path || path === 'root') {
      ensureChildren(fileSystem.root);
      return fileSystem.root;
    }
    const parts = path.split('/').filter(function(p) { return p.length > 0; });
    let node = fileSystem.root;
    ensureChildren(node);
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (!node.children || !node.children[p]) return null;
      node = node.children[p];
      ensureChildren(node);
    }
    return node;
  }

  function getParentPath(path) {
    if (!path || path === 'root') return 'root';
    const p = path.split('/').filter(function(p) { return p.length > 0; });
    p.pop();
    return p.length === 0 ? 'root' : p.join('/');
  }

  function getFileName(path) {
    if (!path || path === 'root') return 'My Project';
    const p = path.split('/').filter(function(p) { return p.length > 0; });
    return p[p.length-1] || '';
  }

  function getFileIconClass(name) {
    if (!name) return 'default';
    const ext = name.split('.').pop().toLowerCase();
    const map = { html:'html', css:'css', js:'js', py:'python', md:'markdown', json:'json', xml:'xml' };
    return map[ext] || 'default';
  }

  function updateEditorState() {
    if (currentFilePath) {
      editor.disabled = false;
      editor.placeholder = 'Start typing...';
    } else {
      editor.disabled = true;
      editor.placeholder = 'Open the File panel (☰) and create a file to start coding...';
    }
  }

  function openExplorer() {
    explorerOverlay.classList.add('open');
    explorerBackdrop.classList.add('active');
  }

  function closeExplorer() {
    explorerOverlay.classList.remove('open');
    explorerBackdrop.classList.remove('active');
  }

  function renderTree(filter) {
    filter = filter || '';
    explorerTree.innerHTML = '';
    ensureChildren(fileSystem.root);
    const rootChildren = Object.keys(fileSystem.root.children);
    if (rootChildren.length === 0) {
      explorerTree.innerHTML = '<div class="watermark">📂 My Project<br><small>Create a file or folder to begin</small></div>';
      return;
    }
    renderNode(fileSystem.root, 'root', explorerTree, 0, filter.toLowerCase());
  }

  function renderNode(node, path, container, level, filter) {
    ensureChildren(node);
    const entries = Object.entries(node.children).sort(function(a,b) {
      if (a[1].type === 'folder' && b[1].type !== 'folder') return -1;
      if (a[1].type !== 'folder' && b[1].type === 'folder') return 1;
      return a[0].localeCompare(b[0]);
    });
    for (let i = 0; i < entries.length; i++) {
      const name = entries[i][0];
      const item = entries[i][1];
      if (filter && !name.toLowerCase().includes(filter)) continue;
      const itemPath = path === 'root' ? name : path + '/' + name;
      const isFolder = item.type === 'folder';
      const wrapper = document.createElement('div');
      const itemDiv = document.createElement('div');
      itemDiv.className = 'tree-item' + (currentFilePath === itemPath ? ' active' : '');
      itemDiv.setAttribute('data-path', itemPath);
      itemDiv.style.paddingLeft = (level * 1 + 0.5) + 'rem';

      if (isFolder) {
        itemDiv.innerHTML = '<i class="arrow fas fa-chevron-right"></i><i class="folder-icon fas fa-folder"></i> ' + esc(name);
      } else {
        const ic = getFileIconClass(name);
        itemDiv.innerHTML = '<span style="width:1rem;display:inline-block;"></span><i class="file-icon ' + ic + ' fas fa-file-code"></i> ' + esc(name);
      }

      const td = document.createElement('span');
      td.className = 'three-dot';
      td.innerHTML = '<i class="fas fa-ellipsis-v"></i>';
      td.onclick = (function(pth, type) {
        return function(e) {
          e.stopPropagation();
          contextTargetPath = pth;
          contextTargetType = type;
          const rect = td.getBoundingClientRect();
          const menuWidth = 160;
          showContextMenu(rect.left - menuWidth - 10, rect.top);
        };
      })(itemPath, item.type);

      itemDiv.appendChild(td);
      itemDiv.onclick = (function(pth, isFolder) {
        return function(e) {
          if (e.target.closest('.three-dot')) return;
          if (isFolder) {
            const arr = itemDiv.querySelector('.arrow');
            arr.classList.toggle('expanded');
            const cd = wrapper.querySelector(':scope > .tree-children');
            if (cd) cd.style.display = cd.style.display === 'none' ? 'block' : 'none';
          } else {
            openFile(pth);
            closeExplorer();
          }
          selectedTreePath = pth;
        };
      })(itemPath, isFolder);

      wrapper.appendChild(itemDiv);
      if (isFolder) {
        const cd = document.createElement('div');
        cd.className = 'tree-children';
        cd.style.display = 'block';
        wrapper.appendChild(cd);
        renderNode(item, itemPath, cd, level + 1, filter);
      }
      container.appendChild(wrapper);
    }
  }

  function esc(s) {
    if (!s) return '';
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function openFile(path) {
    if (currentFilePath) {
      const pn = getNode(currentFilePath);
      if (pn && pn.type === 'file') {
        pn.content = editor.value;
      }
    }
    const node = getNode(path);
    if (!node || node.type !== 'file') return;
    currentFilePath = path;
    editor.value = node.content || '';
    pathText.textContent = path;
    updateEditorState();
    saveFS();
    renderTree(searchInput.value);
    editor.focus();
  }

  function showModal(mode, parentPath) {
    modalMode = mode;
    modalParentPath = parentPath || 'root';

    const parent = getNode(modalParentPath);
    if (parent && parent.type === 'folder') {
      modalLabel.textContent = mode === 'file' ? 'New File' : 'New Folder';
      modalInput.value = mode === 'file' ? 'untitled.txt' : 'new-folder';
      modalOverlay.classList.add('active');
      setTimeout(function() {
        modalInput.focus();
        modalInput.select();
      }, 150);
    } else {
      showToast('Cannot create here. Select a folder first.');
    }
  }

  function hideModal() {
    modalOverlay.classList.remove('active');
  }

  function createItem() {
    const name = modalInput.value.trim();
    if (!name) {
      showToast('Please enter a name');
      modalInput.focus();
      return;
    }

    const parent = getNode(modalParentPath);
    if (!parent) {
      showToast('Parent folder not found');
      return;
    }

    if (parent.type !== 'folder') {
      showToast('Cannot create item in a file');
      return;
    }

    ensureChildren(parent);

    if (parent.children[name]) {
      showToast('Name already exists');
      modalInput.focus();
      modalInput.select();
      return;
    }

    if (modalMode === 'file') {
      parent.children[name] = { type: 'file', content: '' };
    } else {
      parent.children[name] = { type: 'folder', children: {} };
    }

    saveFS();
    renderTree(searchInput.value);
    hideModal();

    if (modalMode === 'file') {
      const newPath = modalParentPath === 'root' ? name : modalParentPath + '/' + name;
      openFile(newPath);
      showToast('File created: ' + name);
    } else {
      showToast('Folder created: ' + name);
    }
  }

  document.getElementById('modalConfirm').onclick = createItem;
  document.getElementById('modalCancel').onclick = hideModal;
  modalOverlay.onclick = function(e) {
    if (e.target === modalOverlay) hideModal();
  };

  modalInput.onkeydown = function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      createItem();
    } else if (e.key === 'Escape') {
      hideModal();
    }
  };

  function deleteItem(path) {
    if (!path || path === 'root') return;
    const name = getFileName(path);
    if (!confirm('Delete "' + name + '"?')) return;
    const pp = getParentPath(path);
    const parent = getNode(pp);
    if (parent && parent.children) {
      delete parent.children[name];
    }
    if (currentFilePath === path) {
      currentFilePath = null;
      editor.value = '';
      pathText.textContent = 'No file open';
      updateEditorState();
    }
    if (clipboardPath === path) {
      clipboardPath = null;
      clipboardAction = null;
    }
    saveFS();
    renderTree(searchInput.value);
    showToast('Deleted: ' + name);
  }

  function renameItem(path) {
    const node = getNode(path);
    if (!node || path === 'root') return;
    const old = getFileName(path);
    const nn = prompt('Rename:', old);
    if (!nn || nn === old) return;
    const pp = getParentPath(path);
    const parent = getNode(pp);
    if (!parent || !parent.children) return;
    if (parent.children[nn]) { showToast('Name exists!'); return; }
    parent.children[nn] = node;
    delete parent.children[old];
    if (currentFilePath === path) {
      currentFilePath = pp === 'root' ? nn : pp + '/' + nn;
      pathText.textContent = currentFilePath;
    }
    saveFS();
    renderTree(searchInput.value);
    showToast('Renamed to: ' + nn);
  }

  function copyPathAction(path) {
    navigator.clipboard.writeText(path).then(function() {
      showToast('Path copied!');
    }).catch(function() {
      showToast('Failed to copy path');
    });
  }

  function cutItem(path) {
    clipboardPath = path;
    clipboardAction = 'cut';
    showToast('Cut to clipboard');
  }

  function copyItem(path) {
    clipboardPath = path;
    clipboardAction = 'copy';
    showToast('Copied to clipboard');
  }

  function pasteItem(targetPath) {
    if (!clipboardPath || !clipboardAction) {
      showToast('Nothing to paste');
      return;
    }
    const sourceNode = getNode(clipboardPath);
    if (!sourceNode) {
      showToast('Source not found');
      clipboardPath = null;
      clipboardAction = null;
      return;
    }
    const targetNode = getNode(targetPath);
    if (!targetNode || targetNode.type !== 'folder') {
      showToast('Select a folder to paste into');
      return;
    }
    ensureChildren(targetNode);
    let name = getFileName(clipboardPath);
    let newName = name;
    let counter = 1;
    while (targetNode.children[newName]) {
      const pts = name.split('.');
      if (pts.length > 1) {
        const ext = pts.pop();
        newName = pts.join('.') + ' (copy ' + counter + ').' + ext;
      } else {
        newName = name + ' (copy ' + counter + ')';
      }
      counter++;
    }
    targetNode.children[newName] = JSON.parse(JSON.stringify(sourceNode));

    if (clipboardAction === 'cut') {
      const pp = getParentPath(clipboardPath);
      const parent = getNode(pp);
      if (parent && parent.children) {
        delete parent.children[getFileName(clipboardPath)];
      }
      if (currentFilePath === clipboardPath) {
        currentFilePath = null;
        editor.value = '';
        pathText.textContent = 'No file open';
        updateEditorState();
      }
      clipboardPath = null;
      clipboardAction = null;
    }
    saveFS();
    renderTree(searchInput.value);
    showToast('Pasted: ' + newName);
  }

  function shareFile(path) {
    const node = getNode(path);
    if (!node || node.type !== 'file') return;
    const content = node.content || '';
    if (navigator.share) {
      const blob = new Blob([content], { type: 'text/plain' });
      const file = new File([blob], getFileName(path), { type: 'text/plain' });
      navigator.share({
        title: getFileName(path),
        files: [file]
      }).catch(function() {});
    } else {
      navigator.clipboard.writeText(content).then(function() {
        showToast('Content copied for sharing!');
      });
    }
  }

  function downloadFileAction(path) {
    const node = getNode(path);
    if (!node || node.type !== 'file') return;
    const blob = new Blob([node.content || ''], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = getFileName(path);
    document.body.appendChild(a);
    a.click();
    setTimeout(function() {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  function buildContextMenu(path, type) {
    const isRoot = (path === 'root');
    let html = '';

    if (type === 'folder') {
      if (isRoot) {
        html += '<button class="context-item" data-action="newFile"><i class="fas fa-file-plus"></i> New File</button>';
        html += '<button class="context-item" data-action="newFolder"><i class="fas fa-folder-plus"></i> New Folder</button>';
        html += '<button class="context-item" data-action="importFile"><i class="fas fa-file-import"></i> Import File</button>';
        html += '<button class="context-item" data-action="importZip"><i class="fas fa-file-archive"></i> Import ZIP</button>';
        html += '<button class="context-item" data-action="rename"><i class="fas fa-pen"></i> Rename</button>';
        html += '<button class="context-item" data-action="copyPath"><i class="fas fa-copy"></i> Copy Path</button>';
        html += '<button class="context-item" data-action="exportFile"><i class="fas fa-file-export"></i> Export</button>';
        html += '<div class="context-separator"></div>';
        html += '<button class="context-item" data-action="delete"><i class="fas fa-trash"></i> Delete</button>';
      } else {
        html += '<button class="context-item" data-action="newFile"><i class="fas fa-file-plus"></i> New File</button>';
        html += '<button class="context-item" data-action="newFolder"><i class="fas fa-folder-plus"></i> New Folder</button>';
        html += '<button class="context-item" data-action="importFile"><i class="fas fa-file-import"></i> Import File</button>';
        html += '<button class="context-item" data-action="copy"><i class="fas fa-copy"></i> Copy</button>';
        html += '<button class="context-item" data-action="cut"><i class="fas fa-cut"></i> Cut</button>';
        if (clipboardPath) {
          html += '<button class="context-item" data-action="paste"><i class="fas fa-paste"></i> Paste</button>';
        }
        html += '<button class="context-item" data-action="rename"><i class="fas fa-pen"></i> Rename</button>';
        html += '<button class="context-item" data-action="copyPath"><i class="fas fa-copy"></i> Copy Path</button>';
        html += '<button class="context-item" data-action="exportFile"><i class="fas fa-file-export"></i> Export</button>';
        html += '<div class="context-separator"></div>';
        html += '<button class="context-item" data-action="delete"><i class="fas fa-trash"></i> Delete</button>';
      }
    } else if (type === 'file') {
      html += '<button class="context-item" data-action="copy"><i class="fas fa-copy"></i> Copy</button>';
      html += '<button class="context-item" data-action="cut"><i class="fas fa-cut"></i> Cut</button>';
      html += '<button class="context-item" data-action="rename"><i class="fas fa-pen"></i> Rename</button>';
      html += '<button class="context-item" data-action="copyPath"><i class="fas fa-copy"></i> Copy Path</button>';
      html += '<button class="context-item" data-action="share"><i class="fas fa-share-alt"></i> Share</button>';
      html += '<button class="context-item" data-action="download"><i class="fas fa-download"></i> Download</button>';
      html += '<button class="context-item" data-action="editAsCode"><i class="fas fa-code"></i> Edit as Code</button>';
      html += '<div class="context-separator"></div>';
      html += '<button class="context-item" data-action="delete"><i class="fas fa-trash"></i> Delete</button>';
    }

    return html;
  }

  function showContextMenu(x, y) {
    contextMenu.innerHTML = buildContextMenu(contextTargetPath, contextTargetType);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const menuWidth = 170;
    let left = x;
    let top = y;
    if (left < 5) left = 5;
    if (left + menuWidth > vw) left = vw - menuWidth - 5;
    if (top + 350 > vh) top = vh - 360;
    if (top < 5) top = 5;
    contextMenu.style.left = left + 'px';
    contextMenu.style.top = top + 'px';
    contextMenu.classList.add('show');
  }

  function hideContextMenu() {
    contextMenu.classList.remove('show');
  }

  contextMenu.onclick = function(e) {
    const actionItem = e.target.closest('.context-item');
    if (!actionItem || !contextTargetPath) return;
    const action = actionItem.getAttribute('data-action');

    const node = getNode(contextTargetPath);
    let targetForCreate = contextTargetPath;

    if (node && node.type === 'file') {
      targetForCreate = getParentPath(contextTargetPath);
    }

    switch(action) {
      case 'newFile': showModal('file', targetForCreate); break;
      case 'newFolder': showModal('folder', targetForCreate); break;
      case 'importFile': importFileTo(targetForCreate); break;
      case 'importZip': importZipTo(targetForCreate); break;
      case 'rename': renameItem(contextTargetPath); break;
      case 'copyPath': copyPathAction(contextTargetPath); break;
      case 'exportFile': downloadFileAction(contextTargetPath); break;
      case 'delete': deleteItem(contextTargetPath); break;
      case 'copy': copyItem(contextTargetPath); break;
      case 'cut': cutItem(contextTargetPath); break;
      case 'paste': pasteItem(contextTargetPath); break;
      case 'share': shareFile(contextTargetPath); break;
      case 'download': downloadFileAction(contextTargetPath); break;
      case 'editAsCode': openFile(contextTargetPath); closeExplorer(); break;
    }
    hideContextMenu();
  };

  document.addEventListener('click', function(e) {
    if (!contextMenu.contains(e.target)) hideContextMenu();
  });

  async function importFileTo(parentPath) {
    try {
      if (!window.showOpenFilePicker) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.html,.css,.js,.py,.md,.txt,.json,.xml,.csv,.ts,.jsx,.tsx';
        input.onchange = async function() {
          const file = input.files[0];
          if (!file) return;
          const content = await file.text();
          addImportedFile(parentPath, file.name, content);
        };
        input.click();
        return;
      }
      const [h] = await window.showOpenFilePicker({
        types: [{
          accept: { 'text/*': ['.html','.css','.js','.py','.md','.txt','.json','.xml','.csv','.ts','.jsx','.tsx'] }
        }]
      });
      const file = await h.getFile();
      const content = await file.text();
      addImportedFile(parentPath, file.name, content);
    } catch(e) {
      if (e.name !== 'AbortError') console.log('Import cancelled');
    }
  }

  async function importZipTo(parentPath) {
    try {
      if (typeof JSZip === 'undefined') {
        showToast('Loading ZIP support...');
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
        document.head.appendChild(script);
        await new Promise(function(res) { script.onload = res; });
      }

      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.zip';
      input.onchange = async function() {
        const file = input.files[0];
        if (!file) return;
        showToast('Extracting ZIP...');
        try {
          const zip = await JSZip.loadAsync(file);
          const parent = getNode(parentPath);
          if (!parent || parent.type !== 'folder') {
            showToast('Invalid target folder');
            return;
          }
          ensureChildren(parent);
          let count = 0;
          const promises = [];
          zip.forEach(function(relativePath, zipEntry) {
            if (zipEntry.dir) return;
            promises.push(
              zipEntry.async('string').then(function(content) {
                const parts = relativePath.split('/');
                let currentParent = parent;
                for (let i = 0; i < parts.length - 1; i++) {
                  const folderName = parts[i];
                  if (!folderName) continue;
                  ensureChildren(currentParent);
                  if (!currentParent.children[folderName]) {
                    currentParent.children[folderName] = { type: 'folder', children: {} };
                  }
                  currentParent = currentParent.children[folderName];
                }
                const fileName = parts[parts.length - 1];
                ensureChildren(currentParent);
                currentParent.children[fileName] = { type: 'file', content: content };
                count++;
              })
            );
          });
          await Promise.all(promises);
          saveFS();
          renderTree(searchInput.value);
          showToast('Imported ' + count + ' files from ZIP');
        } catch(e) {
          showToast('Failed to extract ZIP: ' + e.message);
        }
      };
      input.click();
    } catch(e) {
      console.error('ZIP import error:', e);
    }
  }

  function addImportedFile(parentPath, name, content) {
    const parent = getNode(parentPath);
    if (parent && parent.type === 'folder') {
      ensureChildren(parent);
      let finalName = name;
      let counter = 1;
      while (parent.children[finalName]) {
        const pts = name.split('.');
        if (pts.length > 1) {
          const ext = pts.pop();
          finalName = pts.join('.') + ' (copy ' + counter + ').' + ext;
        } else {
          finalName = name + ' (copy ' + counter + ')';
        }
        counter++;
      }
      parent.children[finalName] = { type: 'file', content: content };
      saveFS();
      renderTree(searchInput.value);
      const newPath = parentPath === 'root' ? finalName : parentPath + '/' + finalName;
      openFile(newPath);
      showToast('Imported: ' + finalName);
    }
  }

  function saveCurrent() {
    if (currentFilePath) {
      const n = getNode(currentFilePath);
      if (n && n.type === 'file') {
        n.content = editor.value;
        saveFS();
        return true;
      }
    }
    return false;
  }

  function downloadFile(name, content) {
    const b = new Blob([content], { type: 'text/plain' });
    const u = URL.createObjectURL(b);
    const a = document.createElement('a');
    a.href = u;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function() {
      document.body.removeChild(a);
      URL.revokeObjectURL(u);
    }, 100);
  }

  function downloadAll() {
    saveCurrent();
    function collect(node) {
      let files = [];
      for (const n in node.children || {}) {
        const item = node.children[n];
        if (item.type === 'file') {
          files.push({ name: n, content: item.content || '' });
        } else {
          files = files.concat(collect(item));
        }
      }
      return files;
    }
    const allFiles = collect(fileSystem.root);
    if (allFiles.length === 0) {
      showToast('No files to download');
      return;
    }
    allFiles.forEach(function(f) {
      downloadFile(f.name, f.content);
    });
    showToast('Downloading ' + allFiles.length + ' files');
  }

  function getLang(path) {
    if (!path) return 'text';
    const ext = path.split('.').pop().toLowerCase();
    const langs = { html:'html', css:'css', js:'js', py:'python', md:'markdown' };
    return langs[ext] || 'text';
  }

  function genPreview(code, lang) {
    if (lang === 'html' || lang === 'css' || lang === 'js') {
      return '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><style>' + (lang === 'css' ? code : '') + '</style></head><body>' + (lang === 'html' ? code : '') + '<script>' + (lang === 'js' ? code : '') + '<\/script></body></html>';
    } else if (lang === 'markdown') {
      let h = code.replace(/```(\w*)\n([\s\S]*?)```/g,'<pre><code>$2</code></pre>');
      h = h.replace(/`([^`]+)`/g,'<code>$1</code>');
      h = h.replace(/^### (.+)$/gm,'<h3>$1</h3>').replace(/^## (.+)$/gm,'<h2>$1</h2>').replace(/^# (.+)$/gm,'<h1>$1</h1>');
      h = h.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\*(.+?)\*/g,'<em>$1</em>');
      return '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><style>body{font-family:system-ui;padding:1.5rem;background:#fff;max-width:800px;margin:0 auto}</style></head><body>' + h.replace(/\n/g,'<br>') + '</body></html>';
    }
    return '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><style>body{white-space:pre-wrap;font-family:monospace;padding:1.5rem;background:#fff}</style></head><body>' + esc(code) + '</body></html>';
  }

  function writeFrame(html) {
    const d = outputFrame.contentDocument || outputFrame.contentWindow.document;
    if (d) {
      d.open();
      d.write(html);
      d.close();
    } else {
      outputFrame.src = 'about:blank';
      outputFrame.onload = function() {
        const dc = outputFrame.contentDocument || outputFrame.contentWindow.document;
        if (dc) {
          dc.open();
          dc.write(html);
          dc.close();
        }
      };
    }
  }

  async function runPython(code) {
    try {
      if (!window.pyodide) {
        showToast('Loading Python runtime...');
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js';
        document.head.appendChild(s);
        await new Promise(function(res, rej) { s.onload = res; s.onerror = rej; });
        window.pyodide = await loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/' });
      }
      await window.pyodide.runPythonAsync('import sys\nfrom io import StringIO\nsys.stdout = StringIO()');
      await window.pyodide.runPythonAsync(code);
      const out = await window.pyodide.runPythonAsync('sys.stdout.getvalue()');
      writeFrame('<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><style>body{font-family:monospace;padding:1.5rem;background:#f8f9ff}</style></head><body>' + esc(out || '✅ Done.') + '</body></html>');
    } catch(e) {
      writeFrame('<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><style>body{font-family:monospace;padding:1.5rem;color:red}</style></head><body>❌ ' + esc(e.message || e) + '</body></html>');
    }
  }

  function executeRun() {
    if (!currentFilePath) {
      showToast('Create or open a file first');
      openExplorer();
      return;
    }
    saveCurrent();
    const lang = getLang(currentFilePath);
    outputOverlay.classList.add('active');
    if (lang === 'python') {
      runPython(editor.value);
    } else {
      writeFrame(genPreview(editor.value, lang));
    }
  }

  function requireFile(action) {
    if (!currentFilePath) {
      showToast('Create or open a file first');
      openExplorer();
      return false;
    }
    return true;
  }

  document.getElementById('explorerToggleBtn').onclick = function() {
    if (explorerOverlay.classList.contains('open')) {
      closeExplorer();
    } else {
      openExplorer();
    }
  };

  explorerBackdrop.onclick = closeExplorer;

  searchToggleBtn.onclick = function() {
    searchDropdownBar.classList.toggle('show');
    searchToggleBtn.classList.toggle('active');
    if (searchDropdownBar.classList.contains('show')) {
      searchInput.focus();
    }
  };

  document.addEventListener('click', function(e) {
    if (!searchDropdownBar.contains(e.target) && e.target !== searchToggleBtn && !searchToggleBtn.contains(e.target)) {
      searchDropdownBar.classList.remove('show');
      searchToggleBtn.classList.remove('active');
    }
  });

  searchInput.oninput = function() {
    renderTree(searchInput.value);
  };

  editor.addEventListener('click', function() {
    if (!currentFilePath) {
      openExplorer();
    }
  });

  document.getElementById('newFileBtn').onclick = function() { showModal('file', 'root'); };
  document.getElementById('newFolderBtn').onclick = function() { showModal('folder', 'root'); };

  explorerMoreBtn.onclick = function(e) {
    e.stopPropagation();
    explorerMoreDropdown.classList.toggle('show');
  };

  document.addEventListener('click', function(e) {
    if (!explorerMoreBtn.contains(e.target)) {
      explorerMoreDropdown.classList.remove('show');
    }
  });

  explorerMoreDropdown.onclick = function(e) {
    const actionItem = e.target.closest('.explorer-more-item');
    if (!actionItem) return;
    const action = actionItem.getAttribute('data-action');
    if (action === 'importFile') {
      importFileTo('root');
    } else if (action === 'importZip') {
      importZipTo('root');
    } else if (action === 'undo') {
      if (requireFile()) { document.execCommand('undo'); editor.focus(); }
    } else if (action === 'redo') {
      if (requireFile()) { document.execCommand('redo'); editor.focus(); }
    }
    explorerMoreDropdown.classList.remove('show');
  };

  editor.oninput = function() {
    if (currentFilePath) {
      const n = getNode(currentFilePath);
      if (n && n.type === 'file') {
        n.content = editor.value;
      }
    }
  };

  document.getElementById('runIconBtn').onclick = executeRun;
  document.getElementById('closeOutputBtn').onclick = function() {
    outputOverlay.classList.remove('active');
    editor.focus();
  };

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && outputOverlay.classList.contains('active')) {
      outputOverlay.classList.remove('active');
      editor.focus();
    }
  });

  editor.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      executeRun();
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      editor.setRangeText('  ', start, end, 'end');
      editor.focus();
    }
  });

  document.getElementById('moreOptionsBtn').onclick = function(e) {
    e.stopPropagation();
    miniDropdown.classList.toggle('show');
  };

  document.addEventListener('click', function(e) {
    if (!document.getElementById('moreOptionsBtn').contains(e.target)) {
      miniDropdown.classList.remove('show');
    }
  });

  miniDropdown.onclick = function(e) {
    const actionItem = e.target.closest('.mini-item');
    if (!actionItem) return;
    const action = actionItem.getAttribute('data-action');
    if (action === 'save') {
      if (!currentFilePath) {
        showToast('No file open. Create a file first.');
        return;
      }
      saveCurrent();
      downloadFile(getFileName(currentFilePath), editor.value);
      const saveBtn = document.getElementById('saveBtn');
      const orig = saveBtn.innerHTML;
      saveBtn.innerHTML = '<i class="fas fa-check"></i>';
      setTimeout(function() { saveBtn.innerHTML = orig; }, 800);
      showToast('Saved!');
    } else if (action === 'saveAs') {
      saveCurrent();
      const n = currentFilePath ? getFileName(currentFilePath) : 'file.txt';
      const nn = prompt('Save as:', n);
      if (nn) {
        downloadFile(nn, editor.value);
        showToast('Saved as: ' + nn);
      }
    } else if (action === 'delete') {
      if (selectedTreePath || currentFilePath) {
        deleteItem(selectedTreePath || currentFilePath);
      }
    } else if (action === 'downloadAll') {
      downloadAll();
    } else if (action === 'clearEditor') {
      if (!currentFilePath) {
        showToast('No file open.');
        return;
      }
      if (confirm('Clear all content?')) {
        editor.value = '';
        const node = getNode(currentFilePath);
        if (node && node.type === 'file') {
          node.content = '';
          saveFS();
        }
        showToast('Cleared');
      }
    }
    miniDropdown.classList.remove('show');
  };

  function moveCursor(dx, dy) {
    if (!currentFilePath) return;
    const t = editor, p = t.selectionStart, txt = t.value, lines = txt.split('\n');
    let cc = 0, cl = 0, col = 0;
    for (let i = 0; i < lines.length; i++) {
      if (cc + lines[i].length >= p) {
        cl = i;
        col = p - cc;
        break;
      }
      cc += lines[i].length + 1;
    }
    if (dy) {
      const nl = Math.max(0, Math.min(lines.length - 1, cl + dy));
      const nc = Math.min(col, lines[nl].length);
      let np = 0;
      for (let j = 0; j < nl; j++) np += lines[j].length + 1;
      np += nc;
      t.setSelectionRange(np, np);
    }
    if (dx) {
      const newPos = Math.max(0, Math.min(txt.length, p + dx));
      t.setSelectionRange(newPos, newPos);
    }
    t.focus();
  }

  document.getElementById('tabBtn').onclick = function() {
    if (!requireFile()) return;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    editor.setRangeText('  ', start, end, 'end');
    editor.focus();
  };
  document.getElementById('arrowUpBtn').onclick = function() { if (requireFile()) moveCursor(0, -1); };
  document.getElementById('arrowDownBtn').onclick = function() { if (requireFile()) moveCursor(0, 1); };
  document.getElementById('arrowLeftBtn').onclick = function() { if (requireFile()) moveCursor(-1, 0); };
  document.getElementById('arrowRightBtn').onclick = function() { if (requireFile()) moveCursor(1, 0); };
  document.getElementById('undoBtn').onclick = function() { if (requireFile()) { document.execCommand('undo'); editor.focus(); } };
  document.getElementById('redoBtn').onclick = function() { if (requireFile()) { document.execCommand('redo'); editor.focus(); } };
  document.getElementById('copySelectionBtn').onclick = function() {
    if (!requireFile()) return;
    if (editor.selectionStart !== editor.selectionEnd) {
      document.execCommand('copy');
    } else {
      navigator.clipboard.writeText(editor.value).then(function() {
        showToast('All text copied!');
      });
    }
    editor.focus();
  };
  document.getElementById('cutBtn').onclick = function() { if (requireFile()) { document.execCommand('cut'); editor.focus(); } };
  document.getElementById('pasteBtn').onclick = function() {
    if (!requireFile()) return;
    navigator.clipboard.readText().then(function(t) {
      editor.setRangeText(t, editor.selectionStart, editor.selectionEnd, 'end');
      editor.focus();
    }).catch(function() {
      document.execCommand('paste');
      editor.focus();
    });
  };
  document.getElementById('saveBtn').onclick = function() {
    if (!currentFilePath) {
      showToast('No file open. Create a file first.');
      return;
    }
    saveCurrent();
    downloadFile(getFileName(currentFilePath), editor.value);
    const btn = document.getElementById('saveBtn');
    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-check"></i>';
    setTimeout(function() { btn.innerHTML = orig; }, 800);
    showToast('Saved!');
  };
  document.getElementById('saveAsBtn').onclick = function() {
    saveCurrent();
    const n = currentFilePath ? getFileName(currentFilePath) : 'file.txt';
    const nn = prompt('Save as:', n);
    if (nn) {
      downloadFile(nn, editor.value);
      showToast('Saved as: ' + nn);
    }
  };
  document.getElementById('aiBtn').onclick = function() {
    if (!currentFilePath) {
      showToast('Open a file to use AI features.');
      return;
    }
    showToast('AI Assistant coming soon!');
  };

  updateEditorState();
  loadFS();
  renderTree();
  editor.value = '';
  pathText.textContent = 'No file open';
})();
