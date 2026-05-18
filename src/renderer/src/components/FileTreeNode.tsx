import { ChevronRight, ChevronDown, FolderOpen, Folder, FileText } from 'lucide-react';
import type { FileNode } from '../types';

interface FileTreeNodeProps {
  node: FileNode;
  expandedDirs: Set<string>;
  onToggle: (path: string) => void;
  onFileClick: (node: FileNode) => void;
}

export default function FileTreeNode({ node, expandedDirs, onToggle, onFileClick }: FileTreeNodeProps) {
  const expanded = expandedDirs.has(node.path);
  return (
    <div>
      <div
        onClick={() => node.isDir ? onToggle(node.path) : onFileClick(node)}
        style={{
          padding: '3px 12px 3px 12px', cursor: 'pointer', display: 'flex',
          alignItems: 'center', gap: 5, color: node.isDir ? 'var(--text)' : 'var(--text-muted)', fontSize: 11,
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        {node.isDir
          ? (expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />)
          : <span style={{ width: 10 }} />}
        {node.isDir
          ? (expanded ? <FolderOpen size={11} style={{ color: 'var(--accent)' }} /> : <Folder size={11} style={{ color: 'var(--accent)' }} />)
          : <FileText size={10} />}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
      </div>
      {node.isDir && expanded && node.children && (
        <div style={{ paddingLeft: 12 }}>
          {node.children.map(child => (
            <FileTreeNode key={child.path} node={child} expandedDirs={expandedDirs} onToggle={onToggle} onFileClick={onFileClick} />
          ))}
        </div>
      )}
    </div>
  );
}
