<template>
  <UDashboardNavbar
    class="absolute top-0 inset-x-0 z-10 border-b-0 pointer-events-none sm:px-4"
    :ui="{ left: 'pointer-events-auto', right: 'pointer-events-auto' }"
  >
    <template #left>
      <UDashboardSidebarCollapse />
    </template>

    <template #right>
      <slot />

      <UButton
        color="neutral"
        variant="ghost"
        icon="i-lucide-plus"
        to="/"
        class="rounded-full lg:hidden"
        aria-label="New chat"
      />
    </template>
  </UDashboardNavbar>
</template>
