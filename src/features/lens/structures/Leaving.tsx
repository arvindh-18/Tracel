import React from 'react';
import { motion, useIsPresent, HTMLMotionProps } from 'motion/react';
import { motionTokens } from '../../../motion/tokens';
import { cx } from '../../../ui/cx';
import styles from './Structure.module.css';

type Dir = 'up' | 'left';
const OFFSET = 8;

/**
 * A structure item with the two-beat insert/remove motion: it enters dim and
 * solidifies; when removed it first turns red in place, then slides out
 * toward the end it leaves from.
 */
export const Leaving: React.FC<HTMLMotionProps<'div'> & { exitTo: Dir; className?: string }> = ({
  exitTo,
  className,
  children,
  ...props
}) => {
  const present = useIsPresent();
  const away = exitTo === 'up' ? { y: -OFFSET } : { x: -OFFSET };
  const from = exitTo === 'up' ? { y: -OFFSET } : { x: OFFSET };
  return (
    <motion.div
      layout
      initial={{ opacity: 0.35, ...from }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      exit={{ opacity: 0, ...away, transition: { delay: motionTokens.duration.base, duration: motionTokens.duration.base } }}
      transition={motionTokens.layoutSpring}
      className={cx(className, !present && styles.leaving)}
      {...props}
    >
      {children}
    </motion.div>
  );
};
