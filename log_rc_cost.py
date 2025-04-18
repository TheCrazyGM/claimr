import datetime
import os

import dataset
from dotenv import load_dotenv
from nectar import Hive
from nectar.account import Account
from nectar.constants import resource_execution_time
from nectar.rc import RC

DB_PATH = os.getenv("RC_COST_DB_PATH", "sqlite:///rc_costs.db")


def setup_hive():
    hive = Hive(node="https://api.hive.blog")
    # Use a public account for RC cost estimation (no private key needed)
    account = Account("hive", blockchain_instance=hive)
    return hive, account


def get_claim_cost():
    hive, account = setup_hive()
    rc = RC(blockchain_instance=hive)
    claim_cost = hive.get_rc_cost(
        rc.get_resource_count(
            tx_size=300,
            execution_time_count=resource_execution_time[
                "claim_account_operation_exec_time"
            ],
            new_account_op_count=1,
        )
    )
    return claim_cost


def log_cost():
    cost = get_claim_cost()
    now = datetime.datetime.now().isoformat()
    db = dataset.connect(DB_PATH)
    table = db["rc_costs"]
    table.insert(dict(timestamp=now, claim_cost=cost))
    print(f"[{now}] RC cost logged: {cost}")


if __name__ == "__main__":
    load_dotenv()
    try:
        log_cost()
    except Exception as e:
        print(f"Error logging RC cost: {e}")
