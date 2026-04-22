"use client";

import Link, { type LinkProps } from "next/link";
import { useRouter } from "next/navigation";
import {
  addTransitionType,
  startTransition,
  type ComponentPropsWithoutRef,
  type MouseEvent,
  type ReactNode,
} from "react";

interface TransitionLinkProps extends Omit<LinkProps, "href">, Omit<ComponentPropsWithoutRef<"a">, "children" | "href"> {
  children: ReactNode;
  href: string;
  transitionTypes?: string[];
}

export default function TransitionLink({
  children,
  className,
  href,
  replace,
  scroll,
  transitionTypes = [],
  ...props
}: TransitionLinkProps) {
  const router = useRouter();

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      props.target === "_blank"
    ) {
      return;
    }

    event.preventDefault();

    startTransition(() => {
      for (const transitionType of transitionTypes) {
        addTransitionType(transitionType);
      }

      if (replace) {
        router.replace(href, { scroll });
      } else {
        router.push(href, { scroll });
      }
    });
  }

  return (
    <Link
      {...props}
      href={href}
      replace={replace}
      scroll={scroll}
      className={className}
      onClick={handleClick}
    >
      {children}
    </Link>
  );
}
