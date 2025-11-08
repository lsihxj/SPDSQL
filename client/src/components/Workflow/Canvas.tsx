import React, { useState, useRef } from 'react';
import ReactFlow, {
  ReactFlowProvider,
  addEdge,
  Controls,
  useNodesState,
  useEdgesState
} from 'reactflow';
import 'reactflow/dist/style.css';

import LlmNodeModal from './LlmNodeModal';
import DbQueryNodeModal from './DbQueryNodeModal';
import ApiCallNodeModal from './ApiCallNodeModal';
import ConditionNodeModal from './ConditionNodeModal';
import WorkflowNode from './WorkflowNode';
import DeletableEdge from './DeletableEdge';

// 固定的类型常量，避免运行时未定义/重复创建
const NODE_TYPES = { workflowNode: WorkflowNode as any };
const EDGE_TYPES = { deletableEdge: DeletableEdge as any };

let id = 0;
const getId = () => `dndnode_${id++}`;

const Canvas: React.FC<{ setWorkflow: (workflow: any) => void, workflow: any, loadVersion?: number }> = ({ setWorkflow, workflow, loadVersion = 0 }) => {
  const reactFlowWrapper = useRef<any>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<any[]>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<any[]>([]);
  const isInitializedRef = React.useRef<boolean>(false);
  const onConnect = (params: any) => setEdges((eds: any[]) => addEdge({ ...params, type: 'deletableEdge' }, eds));
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedNode, setSelectedNode] = useState<any>(null);

  // 首次挂载：若父级传入 workflow 含节点/边，则优先用其初始化画布（并迁移补齐）
  const didInitFromPropsRef = React.useRef(false);
  React.useEffect(() => {
    if (didInitFromPropsRef.current) return;
    didInitFromPropsRef.current = true;
    try {
      const wf = workflow || {};
      const hasNodes = Array.isArray(wf.nodes) && wf.nodes.length > 0;
      const hasEdges = Array.isArray(wf.edges) && wf.edges.length > 0;
      if (hasNodes || hasEdges) {
        const inferKind = (label?: string) => {
          switch (label) {
            case 'Start': return 'start'
            case 'Output': return 'output'
            case 'LLM Node': return 'llm'
            case 'Condition Node': return 'condition'
            case 'API Call Node': return 'apiCall'
            case 'DB Query Node': return 'dbQuery'
            default: return 'custom'
          }
        }
        let migrated = (wf.nodes || []).map((n: any) => ({
          ...n,
          type: 'workflowNode',
          dragHandle: '.wf-body',
          data: { ...n.data, kind: n.data?.kind || inferKind(n.data?.label) }
        }))
        if (!migrated.some((n: { id: string }) => n.id === 'start')) {
          migrated = migrated.concat({ id: 'start', type: 'workflowNode', position: { x: 80, y: 80 }, data: { label: 'Start', kind: 'start' } })
        }
        if (!migrated.some((n: { id: string }) => n.id === 'output')) {
          migrated = migrated.concat({ id: 'output', type: 'workflowNode', position: { x: 1000, y: 80 }, data: { label: 'Output', kind: 'output' }, dragHandle: '.wf-body' })
        }
        setNodes(migrated)
        const migratedEdges = (wf.edges || []).map((e: any) => ({ ...e, type: 'deletableEdge' }))
        setEdges(migratedEdges)
        // 从父级完成一次性初始化后，标记初始化完成，允许回写
        if (!isInitializedRef.current) isInitializedRef.current = true;
      }
    } catch {}
  }, [])

  // 初始化：自动添加开始/输出节点（若不存在），使用自定义 workflowNode（左右把手）
  React.useEffect(() => {
    setNodes((existing: any[]) => {
      let changed = false;
      let next = existing.slice();
      if (!next.some(n => n.id === 'start')) {
        next = next.concat({ id: 'start', type: 'workflowNode', position: { x: 80, y: 80 }, data: { label: 'Start', kind: 'start' } });
        changed = true;
      }
      if (!next.some(n => n.id === 'output')) {
        next = next.concat({ id: 'output', type: 'workflowNode', position: { x: 1000, y: 80 }, data: { label: 'Output', kind: 'output' }, dragHandle: '.wf-body' });
        changed = true;
      }
      // 标记初始化已完成：无论是否变更，都视为一次初始化流程
      if (!isInitializedRef.current) {
        isInitializedRef.current = true;
      }
      return changed ? next : existing;
    });
  }, []);

  // 删除选中节点/边：这里可按需实现（当前使用 onNodesChange/onEdgesChange 即可）

  const onSave = (data: any) => {
    setNodes((ns: any[]) => ns.map((n: any) => (n.id === selectedNode.id ? { ...n, data: { ...n.data, ...data } } : n)));
    setSelectedNode(null);
    setIsModalOpen(false);
  };

  // 仅在加载文件时（loadVersion 递增）从父组件覆盖，避免父子循环导致闪烁
  const didMountRef = React.useRef(false);
  React.useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return; // 初始不从父级覆盖，保持画布为真源
    }
    if (loadVersion > 0) {
      const inferKind = (label?: string) => {
        switch (label) {
          case 'Start': return 'start'
          case 'Output': return 'output'
          case 'LLM Node': return 'llm'
          case 'Condition Node': return 'condition'
          case 'API Call Node': return 'apiCall'
          case 'DB Query Node': return 'dbQuery'
          default: return 'custom'
        }
      }
      let migrated = (workflow.nodes || []).map((n: any) => ({
        ...n,
        type: 'workflowNode',
        dragHandle: '.wf-body',
        data: { ...n.data, kind: n.data?.kind || inferKind(n.data?.label) }
      }))
      // 补齐 Start/Output
      if (!migrated.some((n: { id: string; }) => n.id === 'start')) {
        migrated = migrated.concat({ id: 'start', type: 'workflowNode', position: { x: 80, y: 80 }, data: { label: 'Start', kind: 'start' } })
      }
      if (!migrated.some((n: { id: string; }) => n.id === 'output')) {
        migrated = migrated.concat({ id: 'output', type: 'workflowNode', position: { x: 1000, y: 80 }, data: { label: 'Output', kind: 'output' }, dragHandle: '.wf-body' })
      }
      setNodes(migrated)
      const migratedEdges = (workflow.edges || []).map((e: any) => ({ ...e, type: 'deletableEdge' }))
      setEdges(migratedEdges)
    }
  }, [loadVersion]);

  // 监听来自节点/边的事件（重命名、打开设置、删除）
  React.useEffect(() => {
    const onRename = (e: any) => {
      const { id, label } = e.detail || {}
      if (!id) return
      setNodes((ns: any[]) => ns.map((n: any) => (n.id === id ? { ...n, data: { ...n.data, label } } : n)))
    }
    const onOpenSettings = (e: any) => {
      const { id } = e.detail || {}
      if (!id) return
      const node = nodes.find(n => n.id === id)
      if (!node) return
      setSelectedNode(node)
      setIsModalOpen(true)
    }
    const onDeleteNode = (e: any) => {
      const { id } = e.detail || {}
      if (!id) return
      setNodes((ns: any[]) => ns.filter((n: any) => n.id !== id))
      setEdges((es: any[]) => es.filter((e: any) => e.source !== id && e.target !== id))
    }
    const onDeleteEdge = (e: any) => {
      const { id } = e.detail || {}
      if (!id) return
      setEdges((es: any[]) => es.filter((e: any) => e.id !== id))
    }
    window.addEventListener('wf:rename-node', onRename as any)
    window.addEventListener('wf:open-settings', onOpenSettings as any)
    window.addEventListener('wf:delete-node', onDeleteNode as any)
    window.addEventListener('wf:delete-edge', onDeleteEdge as any)
    return () => {
      window.removeEventListener('wf:rename-node', onRename as any)
      window.removeEventListener('wf:open-settings', onOpenSettings as any)
      window.removeEventListener('wf:delete-node', onDeleteNode as any)
      window.removeEventListener('wf:delete-edge', onDeleteEdge as any)
    }
  }, [nodes])

  React.useEffect(() => {
    if (!isInitializedRef.current) return; // 初始化完成后才向父级同步，避免刷新时被空白覆盖
    setWorkflow({ nodes, edges });
  }, [nodes, edges, setWorkflow]);

  // 预览/执行高亮：监听执行事件，按节点显示运行动画
  React.useEffect(() => {
    const setRunning = (nodeId?: string) => {
      setNodes((ns: any[]) => ns.map((n: any) => ({ ...n, data: { ...n.data, isRunning: nodeId ? n.id === nodeId : false } }))
      )
    };
    const onStart = () => setRunning(undefined);
    const onProgress = (e: any) => {
      const { nodeId } = e.detail || {};
      if (!nodeId) return;
      setRunning(nodeId);
    };
    const onEnd = () => setRunning(undefined);
    window.addEventListener('wf:execution-start', onStart as any);
    window.addEventListener('wf:execution-progress', onProgress as any);
    window.addEventListener('wf:execution-end', onEnd as any);
    return () => {
      window.removeEventListener('wf:execution-start', onStart as any);
      window.removeEventListener('wf:execution-progress', onProgress as any);
      window.removeEventListener('wf:execution-end', onEnd as any);
    };
  }, [setNodes]);


  const onDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();

    const type = event.dataTransfer.getData('application/reactflow');
    const name = event.dataTransfer.getData('application/reactflow-nodeName');
    const position = reactFlowInstance.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });
    const rfType = 'workflowNode';
    const kind = name === 'LLM Node' ? 'llm' : name === 'Condition Node' ? 'condition' : name === 'API Call Node' ? 'apiCall' : name === 'DB Query Node' ? 'dbQuery' : 'custom';
    const newNode = {
      id: getId(),
      type: rfType,
      position,
      data: { label: name, kind },
    };

    setNodes((ns: any[]) => ns.concat(newNode));
  };

  const renderModal = () => {
    if (!selectedNode) return null;

    const modalProps = {
      node: selectedNode,
      isOpen: isModalOpen,
      onRequestClose: () => setIsModalOpen(false),
      onSave: onSave,
    };

    switch (selectedNode.data.kind) {
      case 'llm':
        return <LlmNodeModal {...modalProps} />;
      case 'condition':
        return <ConditionNodeModal {...modalProps} />;
      case 'apiCall':
        return <ApiCallNodeModal {...modalProps} />;
      case 'dbQuery':
        return <DbQueryNodeModal {...modalProps} />;
      default:
        return null;
    }
  };

  // 右键创建节点菜单的状态
  const [menu, setMenu] = useState<{ open: boolean; x: number; y: number; fromNodeId?: string; handleType?: 'source' | 'target'; side?: 'left' | 'right' }>(() => ({ open: false, x: 0, y: 0 }))

  React.useEffect(() => {
    const handler = (e: any) => {
      const { clientX, clientY, nodeId, handleType, side } = e.detail || {}
      setMenu({ open: true, x: clientX, y: clientY, fromNodeId: nodeId, handleType, side })
    }
    const close = (e: Event) => {
      // 点击外部关闭，但不要拦截 ReactFlow 内部左键拖线
      setMenu(m => ({ ...m, open: false }))
    }
    window.addEventListener('wf:show-create-menu', handler as any)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    document.addEventListener('click', close)
    return () => {
      window.removeEventListener('wf:show-create-menu', handler as any)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
      document.removeEventListener('click', close)
    }
  }, [])

  const createNodeAndConnect = (kind: 'llm' | 'condition' | 'apiCall' | 'dbQuery') => {
    if (!reactFlowInstance || !menu.fromNodeId) return
    // 将屏幕坐标转换为画布坐标，稍作偏移，依据 handle 方向放置
    const base = reactFlowInstance.screenToFlowPosition({ x: menu.x, y: menu.y })
    const offsetX = menu.side === 'left' ? -220 : 220
    const position = { x: base.x + offsetX, y: base.y }
    const labelMap: Record<string, string> = {
      llm: 'LLM Node',
      condition: 'Condition Node',
      apiCall: 'API Call Node',
      dbQuery: 'DB Query Node',
    }
    const newNode = { id: getId(), type: 'workflowNode', position, data: { label: labelMap[kind], kind } }
    setNodes((ns: any[]) => ns.concat(newNode))

    // 自动连线：如果当前是source，从当前到新节点；如果是target，则从新节点到当前
    const source = menu.handleType === 'source' ? menu.fromNodeId! : newNode.id
    const target = menu.handleType === 'source' ? newNode.id : menu.fromNodeId!
    setEdges((eds: any[]) => addEdge({ id: `${source}-${target}-${Date.now()}`, source, target, type: 'deletableEdge' } as any, eds))
    setMenu(m => ({ ...m, open: false }))
  }

  const MenuOverlay = () => {
    if (!menu.open) return null
    return (
      <div
        className="wf-context-menu"
        style={{ left: menu.x + 8, top: menu.y + 8 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="wf-menu-item" onClick={() => createNodeAndConnect('llm')}>🤖 LLM Node</div>
        <div className="wf-menu-item" onClick={() => createNodeAndConnect('condition')}>🔀 Condition Node</div>
        <div className="wf-menu-item" onClick={() => createNodeAndConnect('apiCall')}>🌐 API Call Node</div>
        <div className="wf-menu-item" onClick={() => createNodeAndConnect('dbQuery')}>🗄️ DB Query Node</div>
        {/* <div className="wf-menu-tip">左键拖线不变，右键可快速新建并连接</div> */}
      </div>
    )
  }

  // 当父级 workflow 更新且当前仅为默认画布时，采用父级数据进行覆盖恢复
  React.useEffect(() => {
    try {
      const wf = workflow || {};
      const hasParent = Array.isArray(wf.nodes) && wf.nodes.length > 0 || Array.isArray(wf.edges) && wf.edges.length > 0
      if (!hasParent) return
      const ids = new Set((nodes || []).map((n: any) => n?.id))
      const onlyDefault = (nodes || []).length <= 2 && ids.has('start') && ids.has('output')
      const isEmpty = (nodes || []).length === 0
      if (!isInitializedRef.current || onlyDefault || isEmpty) {
        const inferKind = (label?: string) => {
          switch (label) {
            case 'Start': return 'start'
            case 'Output': return 'output'
            case 'LLM Node': return 'llm'
            case 'Condition Node': return 'condition'
            case 'API Call Node': return 'apiCall'
            case 'DB Query Node': return 'dbQuery'
            default: return 'custom'
          }
        }
        let migrated = (wf.nodes || []).map((n: any) => ({
          ...n,
          type: 'workflowNode',
          dragHandle: '.wf-body',
          data: { ...n.data, kind: n.data?.kind || inferKind(n.data?.label) }
        }))
        if (!migrated.some((n: { id: string }) => n.id === 'start')) {
          migrated = migrated.concat({ id: 'start', type: 'workflowNode', position: { x: 80, y: 80 }, data: { label: 'Start', kind: 'start' } })
        }
        if (!migrated.some((n: { id: string }) => n.id === 'output')) {
          migrated = migrated.concat({ id: 'output', type: 'workflowNode', position: { x: 1000, y: 80 }, data: { label: 'Output', kind: 'output' }, dragHandle: '.wf-body' })
        }
        setNodes(migrated)
        const migratedEdges = (wf.edges || []).map((e: any) => ({ ...e, type: 'deletableEdge' }))
        setEdges(migratedEdges)
        isInitializedRef.current = true
      }
    } catch {}
  }, [workflow])

  return (
    <div style={{ height: '100%' }} ref={reactFlowWrapper}>
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={setReactFlowInstance}
          onDrop={onDrop}
          onDragOver={onDragOver}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
        >
          <Controls />
        </ReactFlow>
        <MenuOverlay />
        {renderModal()}
      </ReactFlowProvider>
    </div>
  );
};

export default Canvas;
