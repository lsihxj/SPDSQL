import React from 'react';

interface NodeProps {
  title: string;
}

const Node: React.FC<NodeProps> = ({ title }) => {
  return (
    <div style={{ border: '1px solid black', padding: '10px', margin: '10px', width: '150px' }}>
      {title}
    </div>
  );
};

export default Node;
