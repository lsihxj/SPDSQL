import React from 'react';

type SidebarProps = {
  onDebug: () => void;
  onSave: () => void;
  onLoad: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onBack: () => void;
  onOpenSaved?: () => void;
  onClear?: () => void;
};

const onDragStart = (event: React.DragEvent, nodeType: string, nodeName: string) => {
  event.dataTransfer.setData('application/reactflow', nodeType);
  event.dataTransfer.setData('application/reactflow-nodeName', nodeName);
  event.dataTransfer.effectAllowed = 'move';
};

const Sidebar: React.FC<SidebarProps> = ({ onDebug, onSave, onLoad, onBack, onOpenSaved, onClear }) => {
  return (
    <aside className="workflow-aside">
      <div className="description">
        <div style={{ color: '#667', marginTop: 6, textAlign: 'center' }}>拖动下面的组件到右侧画布中</div>
      </div>
      <div className="dndnode llm" onDragStart={(event) => onDragStart(event, 'default', 'LLM Node')} draggable>LLM Node</div>
      <div className="dndnode condition" onDragStart={(event) => onDragStart(event, 'default', 'Condition Node')} draggable>Condition Node</div>
      <div className="dndnode api" onDragStart={(event) => onDragStart(event, 'default', 'API Call Node')} draggable>API Call Node</div>
      <div className="dndnode db" onDragStart={(event) => onDragStart(event, 'default', 'DB Query Node')} draggable>DB Query Node</div>

    </aside>
  );
};

export default Sidebar;
