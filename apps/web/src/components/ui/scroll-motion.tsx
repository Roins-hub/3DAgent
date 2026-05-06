"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Layers3, WandSparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const easeOut = [0.16, 1, 0.3, 1] as const;

type RevealProps = {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "article" | "section";
};

export function Reveal({
  children,
  className,
  delay = 0,
  as = "div",
}: RevealProps) {
  const reduceMotion = useReducedMotion();
  const Component = motion[as];

  return (
    <Component
      initial={reduceMotion ? false : { opacity: 0, y: 34, filter: "blur(10px)" }}
      whileInView={
        reduceMotion
          ? { opacity: 1 }
          : { opacity: 1, y: 0, filter: "blur(0px)" }
      }
      viewport={{ once: true, amount: 0.3 }}
      transition={{ delay, duration: 0.9, ease: easeOut }}
      className={className}
    >
      {children}
    </Component>
  );
}

export function AnimatedStudioObject({
  stat,
  dark = false,
  delay = 0,
}: {
  stat: string;
  dark?: boolean;
  delay?: number;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className={cn("studio-object motion-studio-object", dark && "motion-studio-object--dark")}
      aria-hidden="true"
      initial={reduceMotion ? false : { opacity: 0, y: 54, scale: 0.94 }}
      whileInView={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.35 }}
      transition={{ delay, duration: 1.05, ease: easeOut }}
    >
      <motion.strong
        initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.96 }}
        whileInView={
          reduceMotion
            ? { opacity: 1 }
            : { opacity: 1, y: [0, -14, 0], scale: [1, 1.045, 1] }
        }
        viewport={{ once: true, amount: 0.45 }}
        transition={{
          delay: delay + 0.22,
          ease: "easeInOut",
          repeat: Infinity,
          opacity: { duration: 0.7, ease: easeOut },
          y: { duration: 4.2, ease: "easeInOut", repeat: Infinity },
          scale: { duration: 4.2, ease: "easeInOut", repeat: Infinity },
        }}
      >
        {stat}
      </motion.strong>
      {[0, 1, 2].map((index) => (
        <motion.span
          key={index}
          className={`studio-card-line studio-card-line-${index + 1}`}
          initial={
            reduceMotion
              ? false
              : {
                  opacity: 0,
                  scale: 0.72,
                  rotate: index === 0 ? -32 : index === 1 ? 26 : -14,
                }
          }
          whileInView={
            reduceMotion
              ? { opacity: 0.42 }
              : {
                  opacity: 0.42,
                  scale: [1, index === 1 ? 1.065 : 1.05, 1],
                  x: [0, index === 0 ? -28 : index === 1 ? 24 : 34, 0],
                  y: [0, index === 0 ? 22 : index === 1 ? -28 : 18, 0],
                  rotate:
                    index === 0
                      ? [-16, -7, -16]
                      : index === 1
                        ? [10, 1, 10]
                        : [-4, 6, -4],
                }
          }
          viewport={{ once: true, amount: 0.45 }}
          transition={{
            delay: delay + 0.12 + index * 0.12,
            ease: "easeInOut",
            repeat: Infinity,
            opacity: { duration: 0.65, ease: easeOut },
            scale: { duration: 5.2 + index * 0.7, ease: "easeInOut", repeat: Infinity },
            x: { duration: 5.2 + index * 0.7, ease: "easeInOut", repeat: Infinity },
            y: { duration: 5.2 + index * 0.7, ease: "easeInOut", repeat: Infinity },
            rotate: { duration: 5.2 + index * 0.7, ease: "easeInOut", repeat: Infinity },
          }}
        />
      ))}
    </motion.div>
  );
}

export function AnimatedClosingMark() {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className="closing-mark motion-closing-mark"
      aria-hidden="true"
      initial={reduceMotion ? false : { opacity: 0, scale: 0.9, y: 36 }}
      whileInView={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
      viewport={{ once: true, amount: 0.45 }}
      transition={{ duration: 1.05, ease: easeOut }}
    >
      <motion.div
        className="closing-mark-layer"
        initial={reduceMotion ? false : { opacity: 0, scale: 0.8 }}
        whileInView={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: [1, 1.12, 1] }}
        viewport={{ once: true, amount: 0.45 }}
        transition={{
          delay: 0.18,
          ease: "easeInOut",
          repeat: Infinity,
          opacity: { duration: 0.7, ease: easeOut },
          scale: { duration: 3.8, ease: "easeInOut", repeat: Infinity },
        }}
      >
        <Layers3 size={92} />
      </motion.div>
      <motion.div
        className="closing-mark-wand"
        initial={reduceMotion ? false : { opacity: 0, x: -18, y: 18, rotate: -12 }}
        whileInView={
          reduceMotion
            ? { opacity: 1 }
            : { opacity: 1, x: [0, 28, 0], y: [0, -34, 0], rotate: [0, 16, 0] }
        }
        viewport={{ once: true, amount: 0.45 }}
        transition={{
          delay: 0.38,
          ease: "easeInOut",
          repeat: Infinity,
          opacity: { duration: 0.7, ease: easeOut },
          x: { duration: 4.2, ease: "easeInOut", repeat: Infinity },
          y: { duration: 4.2, ease: "easeInOut", repeat: Infinity },
          rotate: { duration: 4.2, ease: "easeInOut", repeat: Infinity },
        }}
      >
        <WandSparkles size={42} />
      </motion.div>
    </motion.div>
  );
}
