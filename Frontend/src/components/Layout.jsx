import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Terminal, ChevronRight, ChevronUp } from 'lucide-react';

export default function Layout({ 
  activityBar,
  leftPanel, 
  centerWorkspace, 
  centerTerminal, 
  rightPanel,
  isLeftOpen = true,
  isRightOpen = true,
  isBottomOpen = true,
  onToggleLeft = () => {},
  onToggleBottom = () => {},
}) {
  const [leftWidth, setLeftWidth] = useState(380);
  const [rightWidth, setRightWidth] = useState(380);
  const [bottomHeight, setBottomHeight] = useState(250);
  const [resizingSide, setResizingSide] = useState(null); // 'left' | 'right' | 'bottom' | null

  const isResizingLeft = useRef(false);
  const isResizingRight = useRef(false);
  const isResizingBottom = useRef(false);

  const leftRatioRef = useRef(380 / window.innerWidth);
  const leftWidthRef = useRef(leftWidth);
  const bottomHeightRef = useRef(bottomHeight);

  // Track coordinates for drag vs click detection on collapsed bars
  const dragStartX = useRef(0);
  const dragStartY = useRef(0);
  const hasMovedLeft = useRef(false);
  const hasMovedBottom = useRef(false);

  useEffect(() => {
    leftWidthRef.current = leftWidth;
  }, [leftWidth]);

  useEffect(() => {
    bottomHeightRef.current = bottomHeight;
  }, [bottomHeight]);

  useEffect(() => {
    const handleResize = () => {
      const offset = activityBar ? 48 : 0;
      const maxW = window.innerWidth - offset;
      const newWidth = Math.max(120, Math.min(maxW, Math.round(leftRatioRef.current * window.innerWidth)));
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
          const newWidth = Math.max(120, Math.min(maxW, e.clientX - offset));
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
          const newHeight = Math.max(80, Math.min(480, window.innerHeight - e.clientY - 24)); // Offset by status bar height
          setBottomHeight(newHeight);
        });
      }
    };

    const handleMouseUp = () => {
      // Snap-to-close checks on drag release
      if (isResizingLeft.current) {
        if (leftWidthRef.current < 180 && onToggleLeft) {
          onToggleLeft(false);
        }
      }
      if (isResizingBottom.current) {
        if (bottomHeightRef.current < 120 && onToggleBottom) {
          onToggleBottom(false);
        }
      }

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
  }, [activityBar, onToggleLeft, onToggleBottom]);

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

  // Drag-to-expand logic for collapsed Left Panel (AI Chat)
  const startLeftCollapsedResize = (e) => {
    e.preventDefault();
    dragStartX.current = e.clientX;
    hasMovedLeft.current = false;

    isResizingLeft.current = true;
    setResizingSide('left');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.body.classList.add('is-resizing', 'is-resizing-col');

    const handleMove = (moveEvent) => {
      const diffX = Math.abs(moveEvent.clientX - dragStartX.current);
      if (diffX > 5 && !hasMovedLeft.current) {
        hasMovedLeft.current = true;
        if (onToggleLeft) onToggleLeft(true);
      }

      if (hasMovedLeft.current) {
        const offset = activityBar ? 48 : 0;
        const maxW = window.innerWidth - offset;
        const newWidth = Math.max(120, Math.min(maxW, moveEvent.clientX - offset));
        setLeftWidth(newWidth);
        leftWidthRef.current = newWidth;
        leftRatioRef.current = newWidth / window.innerWidth;
      }
    };

    const handleUp = () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);

      if (!hasMovedLeft.current) {
        // Single click: toggle open with default width
        if (onToggleLeft) onToggleLeft(true);
        setLeftWidth(380);
        leftWidthRef.current = 380;
      } else {
        // Snap-to-close checks on release
        if (leftWidthRef.current < 180 && onToggleLeft) {
          onToggleLeft(false);
        }
      }

      isResizingLeft.current = false;
      setResizingSide(null);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
      document.body.classList.remove('is-resizing', 'is-resizing-col');
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  };

  // Drag-to-expand logic for collapsed Bottom Panel (Terminal)
  const startBottomCollapsedResize = (e) => {
    e.preventDefault();
    dragStartY.current = e.clientY;
    hasMovedBottom.current = false;

    isResizingBottom.current = true;
    setResizingSide('bottom');
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    document.body.classList.add('is-resizing', 'is-resizing-row');

    const handleMove = (moveEvent) => {
      const diffY = Math.abs(moveEvent.clientY - dragStartY.current);
      if (diffY > 5 && !hasMovedBottom.current) {
        hasMovedBottom.current = true;
        if (onToggleBottom) onToggleBottom(true);
      }

      if (hasMovedBottom.current) {
        const newHeight = Math.max(80, Math.min(480, window.innerHeight - moveEvent.clientY - 24));
        setBottomHeight(newHeight);
        bottomHeightRef.current = newHeight;
      }
    };

    const handleUp = () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);

      if (!hasMovedBottom.current) {
        // Single click: toggle open with default height
        if (onToggleBottom) onToggleBottom(true);
        setBottomHeight(250);
        bottomHeightRef.current = 250;
      } else {
        // Snap-to-close checks on release
        if (bottomHeightRef.current < 120 && onToggleBottom) {
          onToggleBottom(false);
        }
      }

      isResizingBottom.current = false;
      setResizingSide(null);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
      document.body.classList.remove('is-resizing', 'is-resizing-row');
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  };

  return (
    <div className="main-content">
      {activityBar}

      {/* Left panel (AI Chat) */}
      {isLeftOpen ? (
        <div className="panel left-panel" style={{ width: `${leftWidth}px`, flexShrink: 0 }}>
          {leftPanel}
        </div>
      ) : (
        <div 
          className="collapsed-panel-bar vertical-collapsed-bar left-collapsed-bar"
          onMouseDown={startLeftCollapsedResize}
          title="Drag or click to open AI Chat"
        >
          <div className="collapsed-handle-icon">
            <MessageSquare size={13} />
          </div>
          <div className="collapsed-label">Chat</div>
          <div className="collapsed-chevron">
            <ChevronRight size={10} />
          </div>
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

        {isBottomOpen ? (
          <div className="center-terminal-area" style={{ height: `${bottomHeight}px`, flexShrink: 0 }}>
            {centerTerminal}
          </div>
        ) : (
          <div 
            className="collapsed-panel-bar horizontal-collapsed-bar bottom-collapsed-bar"
            onMouseDown={startBottomCollapsedResize}
            title="Drag or click to open Terminal / Output"
          >
            <div className="collapsed-handle-icon">
              <Terminal size={13} />
            </div>
            <div className="collapsed-label">Terminal & Output</div>
            <div className="collapsed-chevron">
              <ChevronUp size={10} />
            </div>
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

      {/* Right panel (AI Chat / Extra) */}
      {isRightOpen && (
        <div className="panel right-panel" style={{ width: `${rightWidth}px`, flexShrink: 0 }}>
          {rightPanel}
        </div>
      )}
    </div>
  );
}
