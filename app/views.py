import os
from datetime import datetime, timedelta

import dataset
from flask import Blueprint, jsonify, render_template, request

main_bp = Blueprint("main", __name__)


@main_bp.route("/api/rc/<username>")
def api_get_rc(username):
    try:
        from nectar import Hive
        from nectar.account import Account

        hive = Hive()
        account = Account(username, blockchain_instance=hive)
        manabar = account.get_rc_manabar()
        rc = {
            "current_mana": int(manabar["current_mana"]),
            "max_mana": int(manabar["max_mana"]),
        }
        claims = account.json().get("pending_claimed_accounts", 0)
        return jsonify({"success": True, "rc": rc, "claims": claims, "message": "OK"})
    except Exception as e:
        return jsonify({"success": False, "rc": 0, "message": str(e)})


DB_PATH = os.getenv("RC_COST_DB_PATH", "sqlite:///rc_costs.db")

# Create index on startup if table exists
try:
    db_startup = dataset.connect(DB_PATH)
    if "rc_costs" in db_startup:
        db_startup["rc_costs"].create_index(["timestamp"])
except Exception as e:
    print(f"Error creating index on startup: {e}")


def get_cost_data(cutoff=None, limit=None, desc=False):
    db = dataset.connect(DB_PATH)
    if "rc_costs" not in db:
        return []
    table = db["rc_costs"]

    query = {}
    if cutoff:
        query["timestamp"] = {">=": cutoff.isoformat()}

    order = ["-timestamp"] if desc else ["timestamp"]
    find_args = {"order_by": order}
    if limit:
        find_args["_limit"] = limit

    return list(table.find(**query, **find_args))


@main_bp.route("/")
def index():
    return render_template("index.html")


@main_bp.route("/claim-account")
def claim_account():
    """Render the account claim page"""
    return render_template("claim_account.html")


@main_bp.route("/claim-account/success")
def claim_success():
    tx = request.args.get("tx")
    acc = request.args.get("acc")
    return render_template("claim_success.html", tx=tx, acc=acc)


@main_bp.route("/api/rc_cost_data")
def rc_cost_data():
    # Determine cutoff and limit based on query params
    hours_param = request.args.get("hours")
    limit_param = request.args.get("limit")

    cutoff = None
    if hours_param:
        try:
            hours = int(hours_param)
            if hours > 0:
                cutoff = datetime.now() - timedelta(hours=hours)
        except ValueError:
            pass  # invalid param, ignore and return all

    limit = None
    if limit_param:
        try:
            limit = int(limit_param)
            if limit <= 0:
                limit = None
        except ValueError:
            pass

    # If limit is specified and we only want the most recent records, we want descending order
    # (otherwise _limit returns the oldest records matching cutoff).
    desc = False
    if limit is not None:
        desc = True

    data = get_cost_data(cutoff=cutoff, limit=limit, desc=desc)

    # Revert to chronological order if fetched in descending order
    if desc:
        data.reverse()

    labels = [row["timestamp"] for row in data]
    costs = [row["claim_cost"] for row in data]
    most_recent_cost = costs[-1] if costs else None
    most_recent_time = labels[-1] if labels else None
    return jsonify(
        {
            "labels": labels,
            "costs": costs,
            "most_recent_cost": most_recent_cost,
            "most_recent_time": most_recent_time,
        }
    )
