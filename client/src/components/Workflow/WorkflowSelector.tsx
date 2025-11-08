import React, { useMemo } from 'react';
import { TextField } from '@mui/material';

interface WorkflowSelectorProps {
  selectedWorkflow: string;
  setSelectedWorkflow: (workflow: string) => void;
  includeUnpublished?: boolean; // 可选：是否包含未发布项，默认仅显示已发布
}

const WorkflowSelector: React.FC<WorkflowSelectorProps> = ({ selectedWorkflow, setSelectedWorkflow, includeUnpublished = false }) => {
  const workflows = useMemo(() => {
    try {
      const list = JSON.parse(localStorage.getItem('workflows') || '[]') || []
      return Array.isArray(list) ? list : []
    } catch {
      return []
    }
  }, [])

  const options = useMemo(() => {
    const list = Array.isArray(workflows) ? workflows : []
    return includeUnpublished ? list : list.filter((x: any) => !!x.published)
  }, [workflows, includeUnpublished])

  return (
    <TextField
      select
      label="工作流"
      size="small"
      sx={{ minWidth: 220 }}
      value={selectedWorkflow}
      onChange={(e) => setSelectedWorkflow(e.target.value)}
      SelectProps={{ native: true }}
    >
      <option value="">选择一个工作流</option>
      {options.map((x: any) => (
        <option key={x.id} value={String(x.id)}>{x.name || x.title || x.id}</option>
      ))}
    </TextField>
  );
};

export default WorkflowSelector;
