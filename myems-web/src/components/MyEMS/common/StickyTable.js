import React, { useEffect, useRef, useState } from 'react';
import classNames from 'classnames';

const StickyTable = ({ children, className }) => {
  const tableScrollRef = useRef(null);
  const floatingScrollRef = useRef(null);
  const [floatingStyle, setFloatingStyle] = useState({ display: 'none' });
  const [contentWidth, setContentWidth] = useState(0);

  useEffect(() => {
    const tableScroll = tableScrollRef.current;
    const floatingScroll = floatingScrollRef.current;
    if (!tableScroll || !floatingScroll) {
      return undefined;
    }

    let syncing = false;

    const updateFloatingScroll = () => {
      const rect = tableScroll.getBoundingClientRect();
      const hasHorizontalOverflow = tableScroll.scrollWidth > tableScroll.clientWidth + 1;
      const isTableActive = rect.top < window.innerHeight - 40 && rect.bottom > window.innerHeight + 8;

      setContentWidth(tableScroll.scrollWidth);
      if (!hasHorizontalOverflow || !isTableActive) {
        setFloatingStyle({ display: 'none' });
        return;
      }

      setFloatingStyle({
        display: 'block',
        left: `${Math.max(rect.left, 0)}px`,
        width: `${Math.min(rect.width, window.innerWidth - Math.max(rect.left, 0))}px`
      });
      floatingScroll.scrollLeft = tableScroll.scrollLeft;
    };

    const syncFromTable = () => {
      if (syncing) {
        return;
      }
      syncing = true;
      floatingScroll.scrollLeft = tableScroll.scrollLeft;
      syncing = false;
    };

    const syncFromFloating = () => {
      if (syncing) {
        return;
      }
      syncing = true;
      tableScroll.scrollLeft = floatingScroll.scrollLeft;
      syncing = false;
    };

    tableScroll.addEventListener('scroll', syncFromTable);
    floatingScroll.addEventListener('scroll', syncFromFloating);
    window.addEventListener('scroll', updateFloatingScroll, true);
    window.addEventListener('resize', updateFloatingScroll);
    updateFloatingScroll();

    return () => {
      tableScroll.removeEventListener('scroll', syncFromTable);
      floatingScroll.removeEventListener('scroll', syncFromFloating);
      window.removeEventListener('scroll', updateFloatingScroll, true);
      window.removeEventListener('resize', updateFloatingScroll);
    };
  }, [children]);

  return (
    <div className={classNames('myems-sticky-table', className)}>
      <div className="myems-sticky-table-body" ref={tableScrollRef}>
        {children}
      </div>
      <div className="myems-sticky-table-floating-scroll" ref={floatingScrollRef} style={floatingStyle}>
        <div style={{ width: contentWidth, height: 1 }} />
      </div>
    </div>
  );
};

export default StickyTable;
