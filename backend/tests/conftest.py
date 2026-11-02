import os
import tempfile

# Keep tests away from the real database and stop the background jobs.
os.environ.setdefault("RSEBL_DB", os.path.join(tempfile.mkdtemp(), "tests.db"))
os.environ["RSEBL_COLLECT"] = "0"
