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


def get_cost_data():
    db = dataset.connect(DB_PATH)
    table = db["rc_costs"]
    rows = list(table.find(order_by=["timestamp"]))
    return rows


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
    data = get_cost_data()
    # Only keep entries from the last 24 hours
    cutoff = datetime.now() - timedelta(hours=24)
    filtered = []
    for row in data:
        try:
            ts = datetime.fromisoformat(row["timestamp"])
            if ts >= cutoff:
                filtered.append(row)
        except Exception:
            continue  # skip malformed timestamps
    labels = [row["timestamp"] for row in filtered]
    costs = [row["claim_cost"] for row in filtered]
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
