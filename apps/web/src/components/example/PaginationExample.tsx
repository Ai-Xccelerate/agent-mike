"use client";

import React, { useState } from "react";
import Pagination from "@/components/ui/pagination/Pagination";

interface PaginationExampleProps {
  totalPages: number;
  showPrevNext?: boolean;
  variant?: "default" | "compact";
  initialPage?: number;
}

const PaginationExample: React.FC<PaginationExampleProps> = ({
  totalPages,
  showPrevNext = true,
  variant = "default",
  initialPage = 1,
}) => {
  const [page, setPage] = useState(initialPage);

  return (
    <Pagination
      currentPage={page}
      totalPages={totalPages}
      onPageChange={setPage}
      showPrevNext={showPrevNext}
      variant={variant}
    />
  );
};

export default PaginationExample;
