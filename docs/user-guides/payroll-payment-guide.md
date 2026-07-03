# Payroll and Payment Guide

## Payroll Profile

Employee payroll profile stores salary foundation, currency, eligibility flags, daily rate mode, overtime eligibility, benefit eligibility, advance eligibility, missed-day deduction, and leave deduction behavior.

## Payment Methods

Supported payment foundations include Cash, Bank Transfer, Bank Salary, and placeholders for cheque/mobile/other where configured.

## Cash Behavior

Cash does not require bank, account number, account name, or bank salary fields. Switching to Cash clears stale bank fields where the UI supports it.

## Bank Transfer / Bank Salary Behavior

Bank Transfer requires active payment institution, account number, account name, and relevant bank fields. Use active institutions only; inactive/archived banks and cash locations are excluded from Bank Transfer selectors.

## Payment Institutions

Common bank setup examples: BML, MIB, SBI, BOC, MCB, HBL, and CBM.

## Payroll Without Attendance

Payroll can run without Attendance. When Attendance is disabled, Payroll must not use attendance records, late penalties, absences, missed punches, or attendance-based days worked.

## Payroll Snapshots, Reports, and Sensitive Data

Payroll uses snapshots and reports/export controls. Sensitive salary/net salary values require sensitive payroll permissions.

