import pytest
from app.schemas import EvidenceCheck, MissingItem
from app.services.gap_checker import evaluate_evidence_gaps


def test_fare_dispute_empty_evidence():
    result = evaluate_evidence_gaps("fare_dispute", [])
    assert isinstance(result, EvidenceCheck)
    assert result.readiness == 0.0
    missing_ids = [m.id for m in result.missing]
    assert missing_ids == ["TRIP_RECEIPT_SCREENSHOT", "MPESA_STATEMENT"]
    assert len(result.missing) == 2
    for m in result.missing:
        assert isinstance(m, MissingItem)
        assert len(m.reason) > 0
    assert result.optional == ["GPS_ROUTE_LOG", "IN_APP_CHAT_SCREENSHOT"]


def test_fare_dispute_partial_and_legacy_evidence():
    # TRIP_RECEIPT is legacy ID for TRIP_RECEIPT_SCREENSHOT
    result = evaluate_evidence_gaps("fare_dispute", ["TRIP_RECEIPT"])
    assert result.readiness == 0.5
    assert len(result.missing) == 1
    assert result.missing[0].id == "MPESA_STATEMENT"
    assert "M-Pesa Statement" in result.missing[0].reason


def test_fare_dispute_all_required_and_optional():
    result = evaluate_evidence_gaps(
        "fare_dispute",
        ["TRIP_RECEIPT_SCREENSHOT", "MPESA_STATEMENT", "GPS_ROUTE_LOG"],
    )
    assert result.readiness == 1.0
    assert result.missing == []
    # GPS_ROUTE_LOG is held, so only IN_APP_CHAT_SCREENSHOT remains in optional
    assert result.optional == ["IN_APP_CHAT_SCREENSHOT"]


def test_passenger_safety_case_type():
    result = evaluate_evidence_gaps("passenger_safety", ["POLICE_ABSTRACT"])
    assert result.readiness == 0.5
    assert len(result.missing) == 1
    assert result.missing[0].id == "INCIDENT_TIMESTAMP_LOG"
    assert "Incident Details" in result.missing[0].reason
    assert result.optional == ["DASHCAM_FOOTAGE", "WITNESS_STATEMENT"]


def test_rating_or_cancellation_case_type():
    result = evaluate_evidence_gaps("rating_or_cancellation", [])
    assert result.readiness == 0.0
    missing_ids = [m.id for m in result.missing]
    assert missing_ids == ["IN_APP_CHAT_SCREENSHOT", "DRIVER_COUNTER_STATEMENT"]
    assert result.optional == ["DASHCAM_FOOTAGE", "DRIVER_RATING_HISTORY"]


def test_fraud_flag_case_type():
    result = evaluate_evidence_gaps(
        "fraud_flag",
        ["DEACTIVATION_NOTICE", "CHRONOLOGICAL_TRIP_LOG", "LOCATION_HISTORY_EXPORT"],
    )
    assert result.readiness == 1.0
    assert result.missing == []
    assert result.optional == ["PASSENGER_MPESA_RECEIPT"]


def test_account_verification_case_type():
    result = evaluate_evidence_gaps("account_verification", ["NATIONAL_ID_DRIVER_LICENSE"])
    assert result.readiness == 0.33
    missing_ids = [m.id for m in result.missing]
    assert missing_ids == ["PSV_BADGE_POLICE_CLEARANCE", "VEHICLE_INSPECTION_INSURANCE"]
    assert result.optional == ["SELFIE_PHOTO", "VEHICLE_PHOTOS"]


def test_out_of_scope_case_type():
    result = evaluate_evidence_gaps("out_of_scope", [])
    assert result.readiness == 1.0
    assert result.missing == []
    assert result.optional == []


def test_uppercase_and_alias_case_types():
    # Test uppercase screaming case types from docs/caseschema.md
    res_fare = evaluate_evidence_gaps("FARE_PAYMENT_DISPUTE", [])
    assert res_fare.readiness == 0.0
    assert len(res_fare.missing) == 2

    res_safety = evaluate_evidence_gaps("PASSENGER_SAFETY_COMPLAINT", [])
    assert res_safety.readiness == 0.0
    assert len(res_safety.missing) == 2

    res_fraud = evaluate_evidence_gaps("ACCOUNT_FRAUD_FLAG", [])
    assert res_fraud.readiness == 0.0
    assert len(res_fraud.missing) == 2

    res_conduct = evaluate_evidence_gaps("RATING_CANCELLATION_DISPUTE", [])
    assert res_conduct.readiness == 0.0
    assert len(res_conduct.missing) == 2


def test_unknown_or_empty_case_type():
    res_unknown = evaluate_evidence_gaps("non_existent_category", ["TRIP_RECEIPT"])
    assert res_unknown.readiness is None
    assert res_unknown.missing == []
    assert res_unknown.optional == []

    res_empty = evaluate_evidence_gaps("", ["TRIP_RECEIPT"])
    assert res_empty.readiness is None
    assert res_empty.missing == []
    assert res_empty.optional == []


def test_none_evidence_held_gracefully_handled():
    result = evaluate_evidence_gaps("fare_dispute", None)
    assert result.readiness == 0.0
    assert len(result.missing) == 2
