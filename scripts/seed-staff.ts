// PINs arrive only through the inherited environment, never argv or output.
async function main() {
  if (process.env.NODE_ENV?.trim().toLowerCase() === "production") {
    throw new Error("Staff bootstrap is disabled in production");
  }
  const { seedStaffAccountsFromEnvironment } = await import("../server/routes/accountVault");
  const result = seedStaffAccountsFromEnvironment();
  console.log(`STAFF_SEED created=${result.created} skipped=${result.skipped}`);
}

main().catch(() => {
  // Errors from filesystem/imports can contain sensitive paths or context.
  console.error("STAFF_SEED failed. Check the environment PIN/role settings and vault permissions; no existing accounts were reset.");
  process.exitCode = 1;
});
