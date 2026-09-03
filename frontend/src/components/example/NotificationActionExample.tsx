"use client";

import React, { useState } from "react";
import Notification from "@/components/ui/notification/Notification";

const NotificationActionExample: React.FC = () => {
  const [count, setCount] = useState(0);

  return (
    <div className="space-y-3">
      <Notification
        variant="info"
        title="Jules queued 24 new prospects"
        message="Review the outbound list before the sequence launches at 9:00 AM CST."
        actionLabel="Review list"
        onAction={() => setCount((c) => c + 1)}
        dismissible
      />
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Action triggered {count} time{count === 1 ? "" : "s"}.
      </p>
    </div>
  );
};

export default NotificationActionExample;
