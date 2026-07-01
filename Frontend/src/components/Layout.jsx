import React, { useState, useEffect, useRef } from 'react';

export default function Layout({ 
  activityBar,
  leftPanel, 
  centerWorkspace, 
  centerTerminal, 
  rightPanel,
  isLeftOpen = true,
  isRightOpen = true,
  isBottomOpen = true
}) {
  const [leftWidth, setLeftWidth] = useState(380);
  const [rightWidth, setRightWidth] = useState(380);
  const [bottomHeight, setBottomHeight] = useState(250);
  const [resizingSide, setResizingSide] = useState(null); // 'left' | 'right' | 'bottom' | null

  const isResizingLeft = useRef(false);
  const isResizingRight = useRef(false);
  const isResizingBottom = useRef(false);

  const leftRatioRef = useRef(380 / window.innerWidth);

  useEffect(() => {
    const handleResize = () => {
      const offset = activityBar ? 48 : 0;
      const maxW = window.innerWidth - offset;
      const newWidth = Math.max(220, Math.min(maxW, Math.round(leftRatioRef.current * window.innerWidth)));
      setLeftWidth(newWidth);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [activityBar]);

  useEffect(() => {
    let animationFrameId = null;

    const handleMouseMove = (e) => {
      const offset = activityBar ? 48 : 0;
      if (isResizingLeft.current) {
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        animationFrameId = requestAnimationFrame(() => {
          const maxW = window.innerWidth - offset;
          const newWidth = Math.max(220, Math.min(maxW, e.clientX - offset));
          setLeftWidth(newWidth);
          leftRatioRef.current = newWidth / window.innerWidth;
        });
      } else if (isResizingRight.current) {
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        animationFrameId = requestAnimationFrame(() => {
          const newWidth = Math.max(280, Math.min(480, window.innerWidth - e.clientX));
          setRightWidth(newWidth);
        });
      } else if (isResizingBottom.current) {
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        animationFrameId = requestAnimationFrame(() => {
          const newHeight = Math.max(160, Math.min(480, window.innerHeight - e.clientY - 24)); // Offset by status bar height
          setBottomHeight(newHeight);
        });
      }
    };

    const handleMouseUp = () => {
      isResizingLeft.current = false;
      isResizingRight.current = false;
      isResizingBottom.current = false;
      setResizingSide(null);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
      document.body.classList.remove('is-resizing', 'is-resizing-col', 'is-resizing-row');
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [activityBar]);

  const startLeftResize = (e) => {
    e.preventDefault();
    isResizingLeft.current = true;
    setResizingSide('left');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.body.classList.add('is-resizing', 'is-resizing-col');
  };

  const startRightResize = (e) => {
    e.preventDefault();
    isResizingRight.current = true;
    setResizingSide('right');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.body.classList.add('is-resizing', 'is-resizing-col');
  };

  const startBottomResize = (e) => {
    e.preventDefault();
    isResizingBottom.current = true;
    setResizingSide('bottom');
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    document.body.classList.add('is-resizing', 'is-resizing-row');
  };

  return (
    <div className="main-content">
      {activityBar}

      {/* Left panel (File Explorer) */}
      {isLeftOpen && (
        <div className="panel left-panel" style={{ width: `${leftWidth}px`, flexShrink: 0 }}>
          {leftPanel}
        </div>
      )}

      {/* Left vertical resizer */}
      {isLeftOpen && (
        <div 
          className={`resizer vertical-resizer ${resizingSide === 'left' ? 'active' : ''}`} 
          onMouseDown={startLeftResize}
        />
      )}

      {/* Center panel (Editor/Preview + Terminal/Logs) */}
      <div className="center-panel">
        <div className="center-workspace">
          {centerWorkspace}
        </div>

        {/* Bottom horizontal resizer */}
        {isBottomOpen && (
          <div 
            className={`resizer horizontal-resizer ${resizingSide === 'bottom' ? 'active' : ''}`} 
            onMouseDown={startBottomResize}
          />
        )}

        {isBottomOpen && (
          <div className="center-terminal-area" style={{ height: `${bottomHeight}px`, flexShrink: 0 }}>
            {centerTerminal}
          </div>
        )}
      </div>

      {/* Right vertical resizer */}
      {isRightOpen && (
        <div 
          className={`resizer vertical-resizer ${resizingSide === 'right' ? 'active' : ''}`} 
          onMouseDown={startRightResize}
        />
      )}

      {/* Right panel (AI Chat) */}
      {isRightOpen && (
        <div className="panel right-panel" style={{ width: `${rightWidth}px`, flexShrink: 0 }}>
          {rightPanel}
        </div>
      )}
    </div>
  );
}
